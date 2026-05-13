# 결제 도우미 부스 v1 — 어드민 대행 결제 + 시재 관리

> 식권 시리즈 (v1~v4), 주류 동의 (alcohol_consent_v1) 와 별개.
> 결제 도우미 부스에서 운영하는 신규 어드민 페이지. 단일 페이지 통합.

---

## 1. 배경

행사 운영 매뉴얼 §1-2 에 약속된 "결제 도우미 부스 — 대리 결제 지원" 기능 신설.

**대상 시나리오:**
- 고연령 손님이 PWA 사용 어려워서 직원에게 부탁
- 손님이 현금으로만 결제 원함
- 손님이 가지고 온 카드를 운영진 외부 단말기로 결제

**핵심 룰:**
- 모든 결제 방식 매장 정산 = 일률 `subtotal × 0.9626` (사용자 결정)
- 매장에 결제 방식 (PG / 단말기 / 현금) 노출 X — 매장은 결제 방식 모름
- 운영진 통계에는 method 별 분리 표시 (운영 손익 파악용)

---

## 2. DB 변경

### `_DEV/Seeds/29_helpdesk_payment.sql`

```sql
BEGIN;

-- 결제 방식 분류
ALTER TABLE payments 
  ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'pg'
  CHECK (payment_method IN ('pg', 'external_card', 'cash', 'voucher_only'));

-- 결제 대행한 운영진 (도우미 누가 처리했는지)
ALTER TABLE payments ADD COLUMN IF NOT EXISTS assisted_by UUID REFERENCES auth.users(id);

-- 외부 단말기 영수증 번호 (환불 시 단말기 추적)
ALTER TABLE payments ADD COLUMN IF NOT EXISTS external_receipt_no TEXT;

-- 통계용 인덱스
CREATE INDEX IF NOT EXISTS idx_payments_method ON payments(payment_method);
CREATE INDEX IF NOT EXISTS idx_payments_assisted_by ON payments(assisted_by) 
  WHERE assisted_by IS NOT NULL;

-- 시재 관리 세션 (1일 1세션)
CREATE TABLE IF NOT EXISTS cash_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_date DATE NOT NULL UNIQUE,
  starting_amount INTEGER NOT NULL CHECK (starting_amount >= 0),
  ending_amount INTEGER CHECK (ending_amount >= 0),
  expected_amount INTEGER,
  difference INTEGER,
  notes TEXT,
  started_by UUID REFERENCES auth.users(id),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_by UUID REFERENCES auth.users(id),
  ended_at TIMESTAMPTZ
);

-- 기존 데이터 마이그레이션
-- 기존 모든 payments 는 payment_method='pg'. 단, voucher_only 케이스는 v3 식권 100% 결제건.
UPDATE payments
SET payment_method = 'voucher_only'
WHERE payment_key IS NULL 
  AND coupon_id IN (SELECT id FROM coupons WHERE type = 'meal_voucher')
  AND payment_method = 'pg';

COMMIT;
```

`expected_amount` / `difference` 는 마감 시점에 계산되는 값.

`external_receipt_no` 는 method='external_card' 일 때만 채움.

---

## 3. `src/types/database.ts` 변경

`payments` Row/Insert/Update:
```typescript
payment_method: 'pg' | 'external_card' | 'cash' | 'voucher_only';
assisted_by: string | null;
external_receipt_no: string | null;
```

`cash_sessions` 테이블 타입 추가 (Row/Insert/Update).

---

## 4. API 신규

### 4-1. `POST /api/help-desk/orders/create`

도우미가 호출. 카트 → 결제까지 1번에 처리.

**입력:**
```typescript
{
  items: { boothId: string; menuId: string; quantity: number }[];
  phone: string | null;        // 쿠폰 사용 시 필수
  couponId: string | null;     // 식권 또는 할인쿠폰 ID
  paymentMethod: 'cash' | 'external_card';  // 'pg', 'voucher_only' 는 본 API 사용 X
  externalReceiptNo: string | null;          // method='external_card' 시 필수
  memo: string | null;                       // 자유 메모
}
```

**처리 흐름:**
1. 카트 검증 (메뉴 존재, 가격, 부스 active)
2. 쿠폰/식권 적용 (기존 `calcVoucherSettlement` / 할인쿠폰 로직 재사용)
3. 1결제 1쿠폰 enforcement
4. 주류 메뉴 포함 시 `alcohol_consent_at = NOW()` 자동 (도우미가 손님 신분증 확인 후 진행한다는 전제)
5. payments row INSERT
   - `payment_method = 입력값`
   - `assisted_by = 현재 운영진 ID`
   - `external_receipt_no = 입력값`
   - `payment_key = NULL`
   - `status = 'paid'` 직행
   - `coupon_id = ...` (있으면)
6. orders rows INSERT (다부스 비례 분배는 v3 로직 재사용)
7. 식권 사용 시 `coupons.used_at` 마킹

전액 식권으로 결제 시 (userPaid=0) → `paymentMethod='voucher_only'` 자동 분기. 도우미가 입력 X (UI 자동).

### 4-2. 시재 관리 API

```
POST /api/help-desk/cash-session/start
  body: { startingAmount: number }
  → cash_sessions row 생성 (오늘 날짜)

GET /api/help-desk/cash-session/today
  → 오늘 세션 + 실시간 expected_amount 계산
  expected_amount = starting_amount 
                  + SUM(payments.total_amount where method='cash' AND status='paid' today)
                  - SUM(refund where method='cash' today)

POST /api/help-desk/cash-session/end
  body: { endingAmount: number, notes: string | null }
  → ending_amount 저장 + difference = ending - expected 계산
```

세션은 하루 1개. 이미 마감된 세션은 재시작 불가. 새벽 자정 넘으면 다음 날 새 세션.

---

## 5. 어드민 신규 페이지

### 5-1. 라우팅

- 경로: `/admin/help-desk`
- 사이드바: "운영" 그룹 → "결제 도우미" (정산 관리 위)
- 아이콘: HandHeart 또는 ShoppingCart

### 5-2. 페이지 구조

탭 3개:
```
[ 주문 입력 ] [ 오늘 내역 ] [ 시재 관리 ]
```

### 5-3. 탭 1: 주문 입력

좌우 분할 레이아웃:

```
┌────────────────────────────┬───────────────────────┐
│ 메뉴 선택 (좌측)            │ 장바구니 (우측 sticky) │
│                            │                       │
│ [매장 필터: A구역▼]         │ • 메뉴 1  ₩4,000  [×] │
│ [메뉴 검색: ___________]    │ • 메뉴 2  ₩6,000  [×] │
│                            │ ────────────          │
│ ┌──┐ ┌──┐ ┌──┐ ┌──┐         │ 합계   ₩10,000        │
│ │메뉴│ │메뉴│ │메뉴│ │메뉴│  │                       │
│ │1  │ │2  │ │3  │ │4  │      │ [전화번호] _________  │
│ └──┘ └──┘ └──┘ └──┘         │                       │
│ ...                         │ 보유 쿠폰              │
│                            │ ○ 할인쿠폰 -2,000     │
│                            │ ○ 식권 8,000원 (3장)   │
│                            │ ○ 사용 안 함 ✓         │
│                            │                       │
│                            │ 결제 방식              │
│                            │ ○ 외부 카드 단말기      │
│                            │ ○ 현금 ✓              │
│                            │                       │
│                            │ [영수증 번호: __] *외부카드│
│                            │ [메모: ____________]   │
│                            │                       │
│                            │ 받을 돈: ₩10,000       │
│                            │ [결제 완료]            │
└────────────────────────────┴───────────────────────┘
```

**메뉴 그리드:**
- 매장 필터 (A/B/C 구역, 또는 매장명 검색)
- 메뉴 카드 클릭 → 장바구니 +1
- 품절 메뉴는 회색 + 클릭 안 됨

**주류 포함 시:** 결제 버튼 위에 빨간 안내 (alcohol_consent_v1 모달과 동일 워딩, 다만 도우미가 직접 신분증 확인 후 진행하므로 모달 대신 inline 경고). 도우미는 "신분증 확인했음" 체크박스 체크 후 결제 가능.

**결제 완료 후:**
- 토스트 알림 "결제 완료. 부스에서 픽업 안내드리세요"
- 장바구니 초기화
- 다음 손님 응대 가능

### 5-4. 탭 2: 오늘 내역

```
─────────────────────────────────
오늘 결제 방식별 합계 (도우미 처리분)
  현금         12건  ₩89,000
  외부 카드    8건   ₩64,500
  식권만       3건   ₩0 (식권 차감액 24,000원)
  ─────────────
  합계         23건  ₩153,500
─────────────────────────────────

처리 내역 (시간순)
┌─────────────────────────────────────────┐
│ 14:23  현금  ₩6,000   바다씨 (속초만두) │
│         메뉴: 만두 2개                   │
│         [환불]                           │
├─────────────────────────────────────────┤
│ 14:18  외부카드 ₩10,000  쿠키사무소     │
│         영수증: TX-2401   메모: 카드환불용 │
│         [환불]                           │
├─────────────────────────────────────────┤
│ 14:10  식권만 ₩0  비어홀                │
│         식권 8,000원 (참가자) - 잔액 2,000원 소멸│
│         [환불]                           │
└─────────────────────────────────────────┘
```

**[환불] 버튼:**
- 클릭 시 `/admin/orders` 의 해당 결제 모달 신탭으로 점프 (또는 인라인 모달)
- method 별 환불 안내 자동 표시 (§7 참조)

본 탭은 **현재 로그인 운영진의 처리분만** 표시 (다른 도우미 분 X). 본인 책임 명확.

### 5-5. 탭 3: 시재 관리

세션 상태별 화면:

**(a) 세션 미시작 (행사 당일 첫 진입):**
```
오늘 (2026-05-15) 시재 세션이 아직 시작되지 않았습니다.

시작 시재 입력:
  [_______] 원 (거스름돈용 보유 현금)

[세션 시작]
```

**(b) 세션 진행 중:**
```
오늘 시재 (2026-05-15)
  시작 시재          ₩50,000
  현금 결제 누적     ₩89,000  (12건)
  현금 환불 누적      -₩6,000  (1건)
  ─────────────
  예상 시재          ₩133,000

  ※ 행사 종료 후 [세션 마감]을 눌러 실제 보유 현금과 대조하세요

[세션 마감]
```

**(c) 마감 입력 모달:**
```
세션 마감 — 실제 시재 입력

예상 시재: ₩133,000

실제 보유 현금: [_______] 원

(차액 자동 표시:
  ✅ 일치
  ⚠ +1,000원 (초과 — 거스름돈 실수 가능성)
  ❌ -500원 (부족 — 사유 확인 필요)
)

[메모: ____________________]

[취소]   [마감 확정]
```

**(d) 마감된 세션:**
```
오늘 (2026-05-15) — 마감됨
  시작 시재          ₩50,000
  예상 시재          ₩133,000
  실제 시재          ₩133,500
  차액               +₩500  (초과)
  메모               "동전 거스름 실수"
  마감 시각          21:15
  마감자             김OO
```

---

## 6. 통계/정산 영향

### 6-1. `StatsRevenueTab` (운영진 통계 — method 노출)

기존 매출 섹션에 결제 방식별 분리 표 추가:

```
─────────────────────────────────
매출 (결제 방식별)
  PG (앱 결제)        450건  ₩4,500,000
  외부 카드 단말기    35건   ₩280,000
  현금                42건   ₩315,000
  식권 100%           18건   ₩0 (식권 차감 144,000)
  ─────────────
  합계                545건  ₩5,095,000
─────────────────────────────────
```

### 6-2. `AdminSettlement` (매장 정산 — method 비공개)

매장별 정산 화면은 **method 분리 표시 X**. 기존 그대로 매출 합계 기준만:

```
매장 A
  매출 합계      ₩760,000  (메뉴 정가 합)
  결제 수수료    -₩28,422  (3.74%)
  ─────────────
  송금 금액      ₩731,578
```

내부적으로는 method 별로 받았지만 매장에는 노출 안 함.

### 6-3. 매뉴얼 워딩 정합성

매뉴얼 §6-2 의 "토스페이먼츠 결제 수수료 3.74%" 워딩은 별도 수정 작업으로 다룸 (본 페이즈 외). 코드 변경 X.

---

## 7. 환불 분기

### 7-1. `api/orders/cancel.ts` 변경

method 별 분기:

```typescript
switch (payment.payment_method) {
  case 'pg':
    // 기존 로직 — 토스 환불 API 호출
    await tossCancel(payment.payment_key, ...);
    break;
  case 'voucher_only':
    // PG 호출 X. payments / orders status 만 cancelled. 식권 복구 X (v3 정책)
    break;
  case 'external_card':
  case 'cash':
    // PG 호출 X. DB 상태만 변경. 실 환불은 운영진 수동
    break;
}
```

### 7-2. `AdminOrders.tsx` 환불 모달

method 별 안내 박스 추가 (환불 버튼 클릭 시 표시):

```
[method='external_card' 케이스]
┌──────────────────────────────────────┐
│ ⚠ 외부 카드 단말기 결제              │
│                                       │
│ 영수증 번호: TX-2401                  │
│                                       │
│ 단말기에서 별도로 환불 처리해주세요.  │
│ 시스템은 정산 데이터에서만 제외됩니다.│
└──────────────────────────────────────┘

[method='cash' 케이스]
┌──────────────────────────────────────┐
│ ⚠ 현금 결제                          │
│                                       │
│ 손님에게 현금으로 직접 반환해주세요.   │
│ 시재 관리 페이지에 자동 반영됩니다.   │
└──────────────────────────────────────┘

[method='voucher_only' 케이스]
┌──────────────────────────────────────┐
│ ⚠ 식권 100% 결제                     │
│                                       │
│ 환불 처리해도 식권은 복구되지 않습니다.│
│ 필요 시 식권 재발급은 별도 진행하세요. │
└──────────────────────────────────────┘
```

각 안내 박스 아래 [환불 진행] 버튼.

---

## 8. 부스앱 영향

**변경 없음.** 부스앱은 method 무관 동일 처리. 결제 도우미 부스에서 발급한 주문도 일반 주문과 동일하게 들어옴.

---

## 9. 확정 사항 (질문 금지)

| Q | 결정 |
|---|---|
| 페이지 위치 | `/admin/help-desk` 별도 페이지. 탭 3개 |
| 탭 구성 | 주문 입력 / 오늘 내역 / 시재 관리 |
| 매장에 method 노출 | X — 매장 정산 화면 method 표시 안 함 |
| 운영진 통계 method 노출 | O — `StatsRevenueTab` 분리 표 |
| 정산 정책 | 모든 method 일률 `subtotal × 0.9626` |
| 시재 관리 단위 | 하루 1세션 (행사 3일 = 3세션) |
| 외부카드 영수증 번호 | method='external_card' 시 필수 입력 |
| 결제 도우미 권한 | 어드민 권한 있는 모든 사용자 (별도 분리 X) |
| 다른 도우미 처리분 보기 | 본 페이즈 X. 본인 처리분만 표시 |
| 주류 메뉴 도우미 결제 | 도우미가 신분증 확인 후 진행. inline 경고 + 체크박스 1단계 |
| 식권 100% 결제 method | 자동 'voucher_only' 분기 (도우미 입력 X) |
| 도우미 처리분 환불 | 본 페이지 직접 환불 X. `/admin/orders` 모달로 점프 |
| 매뉴얼 §6-2 워딩 수정 | 본 페이즈 외. 별도 매뉴얼 업데이트 작업 |

---

## 10. 검증 절차 — 작업 완료 후 사용자 실행

### 10-1. UI 점검

- [ ] 사이드바에 "결제 도우미" 노출 + 진입
- [ ] 탭 3개 전환
- [ ] 주문 입력 탭 — 메뉴 검색/카트/결제 흐름 정상
- [ ] 외부카드 선택 시 영수증 번호 필수 검증
- [ ] 주류 포함 결제 시 inline 경고 + 체크 강제
- [ ] 결제 완료 후 부스앱에 주문 즉시 도착
- [ ] 오늘 내역 탭 — 자기 처리분만 시간순
- [ ] 시재 관리 — 세션 시작/마감/차액 계산

### 10-2. 결제 케이스 (검증 시나리오 별도 매뉴얼 작성 필요)

핵심 케이스 (운영진이 추후 검증):
- 현금 결제 (단일 부스 / 다부스)
- 외부 카드 결제 (영수증 번호 기록 확인)
- 현금 + 식권 (잔액 발생 케이스)
- 외부카드 + 할인쿠폰
- 식권 100% (자동 voucher_only 분기)
- 주류 메뉴 포함 결제 (체크박스 강제)

### 10-3. 통계 검증

```sql
-- method 별 분포
SELECT payment_method, COUNT(*) AS cnt, SUM(total_amount) AS total
FROM payments
WHERE status = 'paid'
GROUP BY payment_method
ORDER BY cnt DESC;

-- 도우미별 처리량
SELECT 
  u.email AS helper,
  COUNT(*) AS handled,
  SUM(p.total_amount) AS total_paid
FROM payments p
LEFT JOIN auth.users u ON u.id = p.assisted_by
WHERE p.assisted_by IS NOT NULL
GROUP BY u.email;

-- 시재 정합성 (현금 결제 - 현금 환불 + 시작시재 = 예상시재)
SELECT 
  cs.session_date,
  cs.starting_amount,
  cs.expected_amount,
  cs.ending_amount,
  cs.difference,
  cs.notes
FROM cash_sessions cs
ORDER BY session_date DESC;
```

### 10-4. 매장 정산 회귀 테스트

매장 정산 화면(`AdminSettlement`)에 method 컬럼 노출 X 확인. 매장별 합계만 표시되고 결제 방식별 분리 X.

### 10-5. 환불 분기

- [ ] PG 결제 환불 → 토스 호출 + DB cancelled
- [ ] 외부카드 환불 → 안내 박스 + DB만 cancelled (토스 호출 X)
- [ ] 현금 환불 → 안내 박스 + DB만 cancelled. 시재 자동 반영
- [ ] 식권 100% 환불 → 안내 박스 + DB만 cancelled. 식권 복구 X

---

## 11. 빌드 검증

`npx tsc --noEmit` 통과 확인. `npx eslint` 변경 파일 한정 0 에러.

---

## 12. 커밋

작업 단위가 크므로 커밋 분할 권장:

```
feat(payment): add payment method classification and assisted_by

- Add payment_method enum to payments
- Add assisted_by, external_receipt_no columns
- Migrate existing voucher-only payments
```

```
feat(help-desk): admin page for assisted payment

- New /admin/help-desk page with 3 tabs
- Order input flow (menu/cart/payment method/receipt)
- Today's history with method breakdown
- Cash session management
```

```
feat(refund): branch by payment method

- PG: existing toss cancel
- External card: DB-only cancel + UI guidance
- Cash: DB-only cancel + auto cash session sync
- Voucher-only: DB-only cancel
```

dev push 까지.

---

## 13. 다음 페이즈 예고 (별도)

- 매뉴얼 §6-2 워딩 수정 ("토스페이먼츠 수수료" → "결제 시스템 수수료")
- 운영진간 처리분 공유 보기 (현재는 본인 것만)
- 시재 관리 시작 시각 자동 기본값 (전날 마감 시재 → 오늘 시작 시재 제안)
- 결제 도우미 검증 시나리오 매뉴얼 (식권 검증과 동일 형식)
