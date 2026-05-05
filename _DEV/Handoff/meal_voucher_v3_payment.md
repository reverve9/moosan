# 식권(meal voucher) 시스템 v3 — 결제 로직 + 정산

> v2 (어드민 수동 발급) 완료 후. 이번 페이즈는 결제 화면에서 식권 사용 처리 + 정산 계산.

---

## 1. 작업 범위

기존 결제 로직에 식권(`type='meal_voucher'`) 처리 분기 추가.

**추가할 것:**
- 결제 화면에서 식권/할인쿠폰 동시 표시 + 1개만 선택
- 식권 사용 시 `voucher_consumed` / `voucher_burned` 계산
- 매장 정산금액 = `voucher_consumed + user_paid` 로직
- 1결제 1쿠폰 강제 (식권+식권, 식권+할인 모두 차단)

**유지:**
- 기존 할인쿠폰 동작 그대로 (10,000원 이상, 2,000원 차감)
- PG 결제는 1건으로 받음 (할인/식권 후 사용자 부담분만)
- 매장 정산 분리 로직(v0 — 세션 27)은 그대로

---

## 2. 결제 화면 변경

### 2-1. 쿠폰 표시

전화번호 입력 시 보유 쿠폰 자동 감지. 식권 + 할인쿠폰 모두 사용 가능한 것 표시:

```
보유 쿠폰
○ 할인 쿠폰 -2,000원 (10,000원 이상 주문 시)
○ 식권 8,000원 [참가자]  (남은 장수: 11장)
○ 식권 5,000원 [스태프]
○ 사용 안 함

(1개만 선택 가능)
```

### 2-2. 표시 룰

- 식권은 액면가별로 그룹핑하여 표시 (같은 8,000원 식권 11장이면 "남은 장수: 11장")
- 만료된 쿠폰 (`expires_at < now()`)은 제외
- 사용된 쿠폰 (`used_at IS NOT NULL`)은 제외
- 할인쿠폰: 주문 합계가 `min_order_amount` 미만이면 비활성 (회색)
- 식권: 주문 합계 무관 항상 선택 가능
- 라디오 버튼 — 1개만 선택 가능

### 2-3. 선택 후 표시

**할인쿠폰 선택 시 (기존 동작):**
```
주문 합계:    15,000원
쿠폰 할인:    -2,000원
─────────────
결제 금액:    13,000원
```

**식권 선택 시 (신규):**

케이스 A) 8,000원 식권 + 6,000원 주문:
```
주문 합계:     6,000원
식권 사용:    -6,000원 (식권 액면가 8,000원 중 사용)
              ※ 잔액 2,000원은 소멸됩니다
─────────────
결제 금액:        0원
```

케이스 B) 8,000원 식권 + 10,000원 주문:
```
주문 합계:    10,000원
식권 사용:    -8,000원
─────────────
결제 금액:     2,000원
```

---

## 3. 결제 처리 로직

### 3-1. 정산 공식

```typescript
function calcVoucherSettlement(orderTotal: number, voucherAmount: number) {
  const consumed = Math.min(voucherAmount, orderTotal);
  const burned = voucherAmount - consumed;
  const userPaid = Math.max(0, orderTotal - voucherAmount);
  
  return {
    voucherConsumed: consumed,    // orders.voucher_consumed
    voucherBurned: burned,        // orders.voucher_burned
    userPaid: userPaid,           // PG로 결제할 금액
    vendorSettlement: orderTotal, // 매장 정산 금액 = consumed + userPaid
  };
}
```

### 3-2. PG 결제

**할인쿠폰:**
- 기존 그대로. 할인 적용 후 금액으로 PG 호출.

**식권:**
- 사용자 부담분(`userPaid`)으로 PG 호출
- `userPaid === 0` 이면 PG 호출 스킵 (전액 식권 결제)
- 결제 완료 처리만 진행

**전액 식권 결제 (userPaid=0) 처리:**
- 토스페이먼츠 호출 없이 orders/order_items row만 생성
- payment row는 어떻게 처리할지 — 기존 코드 패턴 따름. 0원 결제 row 생성 또는 voucher 전용 처리.
- 환불 시도 시 PG 호출 안 함 (해당 payment_key 없음)

### 3-3. orders 저장

```typescript
const order = {
  // ... 기존 필드 ...
  coupon_id: selectedCoupon?.id ?? null,
  
  // 식권 선택 시
  voucher_consumed: isVoucher ? consumed : 0,
  voucher_burned: isVoucher ? burned : 0,
};
```

### 3-4. 쿠폰 사용 처리

선택된 쿠폰 1장만 `used_at`, `used_payment_id` 마킹.

식권은 1결제에 1장만 사용되므로 동일 row 1개만 마킹. (인솔교사 11장 보유 → 1결제마다 1장씩 차감)

---

## 4. 1결제 1쿠폰 enforcement

### 4-1. UI 강제

라디오 버튼이라 자연스럽게 1개만 선택됨.

### 4-2. API 강제

결제 API 진입 시 검증:
```typescript
// 쿠폰 ID 1개만 받음 (배열 X)
const { couponId } = req.body;
if (Array.isArray(couponId)) {
  return error('Multiple coupons are not allowed');
}
```

### 4-3. DB 제약

기존 `orders.coupon_id` 단일 컬럼 그대로 사용. DB 스키마 변경 없음.

---

## 5. 엣지 케이스 처리

### 5-1. 만료된 식권
- 결제 화면에 노출 안 함
- API 진입 시점에 `expires_at > now()` 재검증 (race 방지)

### 5-2. 이미 사용된 식권 (race)
- API 진입 시점에 `used_at IS NULL` 재검증
- 동시 결제 시 한쪽만 성공, 다른 쪽 에러 반환 → 사용자에게 "이미 사용된 쿠폰" 메시지

### 5-3. 전액 식권 결제 (userPaid = 0)
- 토스페이먼츠 호출 스킵
- 영수증 화면은 정상 노출 (식권 차감액 표시)
- 환불 시: 식권 복구 정책은 본 페이즈 외 (v3.5에서 결정 또는 운영진 수동 처리)

### 5-4. 식권 잔액 소멸 안내
- 결제 화면에 명시: "잔액 2,000원은 소멸됩니다"
- 결제 후 영수증에도 동일 안내
- 사용자가 의식적으로 알고 결제하도록

---

## 6. 확정 사항 (질문 금지)

| Q | 결정 |
|---|---|
| 1결제 1쿠폰 | UI 라디오 + API 단일 ID enforcement |
| 식권 선택 우선순위 | 사용자 선택 (자동 추천 X) |
| 잔액 소멸 안내 | 결제 화면 + 영수증 모두 명시 |
| 전액 식권 결제 PG 호출 | 스킵. orders row만 생성 |
| 환불 시 식권 복구 | 본 페이즈 외. 운영진 수동 처리 |
| 만료/사용 검증 | UI 필터 + API 재검증 (race 방지) |
| 매장 정산 | `voucher_consumed + user_paid` (메뉴 정가 그대로) |

---

## 7. 검증 절차 — 작업 완료 후 사용자 실행

### 7-1. UI 점검

- [ ] 결제 화면에 식권/할인쿠폰 동시 표시
- [ ] 라디오 1개만 선택 가능
- [ ] 식권 선택 → 잔액 소멸 안내 노출
- [ ] 할인쿠폰 — 10,000원 미만 주문 시 비활성

### 7-2. 케이스별 결제 테스트

**케이스 A: 8,000원 식권 + 6,000원 주문 (잔액 소멸)**
- [ ] 결제 화면: "잔액 2,000원 소멸" 안내
- [ ] 결제 금액: 0원
- [ ] PG 호출 스킵
- [ ] orders.voucher_consumed = 6000
- [ ] orders.voucher_burned = 2000
- [ ] coupons.used_at != NULL

**케이스 B: 8,000원 식권 + 10,000원 주문**
- [ ] 결제 금액: 2,000원
- [ ] PG로 2,000원 호출
- [ ] orders.voucher_consumed = 8000
- [ ] orders.voucher_burned = 0
- [ ] orders.subtotal = 10000 (메뉴 정가)

**케이스 C: 할인쿠폰 + 15,000원 주문 (기존 흐름)**
- [ ] 기존 동작 그대로
- [ ] 결제 금액: 13,000원
- [ ] orders.voucher_consumed = 0
- [ ] orders.voucher_burned = 0

**케이스 D: 인솔교사 11장 — 5번 결제 후**
- [ ] 사용 가능 식권: 11장 → 6장
- [ ] 결제 화면: "남은 장수: 6장"

### 7-3. 정산 검증 SQL

```sql
-- 식권 사용 주문 확인
SELECT 
  o.id,
  o.subtotal AS menu_price,
  o.voucher_consumed,
  o.voucher_burned,
  (o.subtotal - o.voucher_consumed) AS user_paid_calculated,
  c.amount AS voucher_amount,
  c.source
FROM orders o
LEFT JOIN coupons c ON c.id = o.coupon_id
WHERE o.voucher_consumed > 0
ORDER BY o.created_at DESC
LIMIT 10;

-- 매장 정산 검증 (= subtotal 그대로인지)
-- vendor_settlement = voucher_consumed + user_paid = subtotal
SELECT 
  SUM(subtotal) AS total_menu_price,
  SUM(voucher_consumed) AS total_voucher_used,
  SUM(voucher_burned) AS total_burned,
  SUM(subtotal - voucher_consumed) AS total_user_paid
FROM orders
WHERE voucher_consumed > 0;
```

### 7-4. 엣지 케이스

- [ ] 만료 임박 식권 (expires_at - 1초) → 결제 직전 만료 → API 거부
- [ ] 이미 사용된 식권 재사용 시도 → API 거부
- [ ] 전액 식권 결제 후 영수증 정상 노출
- [ ] 같은 사용자가 같은 매장에 여러 번 결제 → 식권 1장씩 차감

---

## 8. 빌드 검증

`npx tsc --noEmit` 통과 확인.

---

## 9. 커밋

```
feat(coupon): meal voucher payment processing and settlement

- Add voucher selection in checkout (single coupon enforcement)
- Calculate voucher_consumed and voucher_burned per order
- Skip PG call when full voucher coverage (userPaid=0)
- Enforce 1-coupon-per-payment at API level
- Validate voucher availability at API entry (race protection)
- Display burned amount notice in checkout and receipt
```

dev push 까지.

---

## 10. 다음 페이즈 예고

- **v4**: 통계 화면
  - 식권 발급/사용/소멸/운영자 부담 분리 표시
  - source별 분리 (참가자/스태프/VIP/기타)
  - 매장 정산 화면에 식권 결제분 분리 표시
  - 자동쿠폰 vs 식권 분리

v3에서 발견된 미해결 이슈는 보고만 하고 v4 또는 별도 페이즈로 분리 검토.
