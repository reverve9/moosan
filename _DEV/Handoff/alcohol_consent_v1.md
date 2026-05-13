# 주류 메뉴 성인 동의 시스템 v1

> 식권 시스템 v1~v4 와 별개. 주류(맥주 등) 매장 합류로 신설. 단일 페이즈.

---

## 1. 배경

행사 직전 주류 판매 매장 1곳이 추가됨. 미성년자 음주 방지 및 매장 책임 보호 차원에서:

- 손님 결제 시 성인 동의 모달 강제
- 부스앱에 주류 주문 시각적 강조 → 직원이 픽업 시 신분증 확인 누락 방지
- 동의 timestamp 를 DB 에 기록 (사후 분쟁 증거)

운영 매뉴얼 §11 (별도 배포)에서 매장 책임 구조는 정리됨. 본 페이즈는 시스템 안전장치 구축.

---

## 2. DB 변경

### `_DEV/Seeds/28_alcohol_menu.sql`

```sql
BEGIN;

-- 메뉴별 주류 플래그
ALTER TABLE food_menus 
  ADD COLUMN IF NOT EXISTS is_alcohol BOOLEAN NOT NULL DEFAULT FALSE;

-- 주문별 성인 동의 시점 (사후 분쟁용 증거)
ALTER TABLE orders 
  ADD COLUMN IF NOT EXISTS alcohol_consent_at TIMESTAMPTZ;

-- 조회 인덱스 (주류 메뉴 필터)
CREATE INDEX IF NOT EXISTS idx_food_menus_is_alcohol 
  ON food_menus(is_alcohol) WHERE is_alcohol = TRUE;

COMMIT;
```

`is_alcohol` 은 BOOLEAN 단일 컬럼. tags 자유 텍스트 활용은 오타 위험("주류" vs "알콜" vs "맥주") 있어 미채택. 어드민 체크박스로 명시.

`alcohol_consent_at` 은 nullable. 주류 미포함 주문은 NULL.

---

## 3. `src/types/database.ts` 변경

`food_menus` Row/Insert/Update:
```typescript
is_alcohol: boolean;
```

`orders` Row/Insert/Update:
```typescript
alcohol_consent_at: string | null;
```

---

## 4. 어드민 — 메뉴 편집

`src/pages/admin/AdminFood.tsx` 메뉴 편집 폼에 체크박스 추가:

```
[ 메뉴명 ____________ ]
[ 가격   ____________ ]
[ 설명   ____________ ]
[ 태그   ____________ ]
[☐ 주류 메뉴 (성인 인증 필요)]   ← 신규
```

`MenuForm.is_alcohol: boolean` 추가. `handleSaveMenu` 가 함께 update.

메뉴 목록에서 주류 메뉴는 메뉴명 옆에 작은 빨간 배지 `🍺 주류` 표시 (운영진이 한눈에 식별).

---

## 5. 손님 결제 — 성인 동의 모달

### 5-1. 트리거

`src/pages/CheckoutPage.tsx` — 장바구니에 `is_alcohol === true` 메뉴가 1개 이상 포함된 경우, 결제 버튼 클릭 시 일반 결제 흐름 전에 모달 노출.

### 5-2. 모달 UI

```
┌──────────────────────────────────────────┐
│  ⚠ 주류 포함 주문 확인                      │
│                                          │
│  주문 내역에 주류가 포함되어 있습니다.        │
│                                          │
│  • 만 19세 미만은 주문할 수 없습니다         │
│  • 픽업 시 신분증을 반드시 제시해야 합니다    │
│  • 신분증 미제시 시 환불 처리되며, 주류는    │
│    제공되지 않습니다                      │
│                                          │
│  ☐ 위 사항을 확인하고 동의합니다             │
│                                          │
│  [취소]              [동의하고 결제]       │
└──────────────────────────────────────────┘
```

UI 원칙:
- 체크 안 하면 [동의하고 결제] disabled
- [취소] → 모달 닫고 결제 진행 안 함 (장바구니 유지)
- [동의하고 결제] → 모달 닫고 결제 흐름 진행 + `alcoholConsentAt = new Date().toISOString()` 메모리에 저장

### 5-3. 결제 처리

`createPendingPayment` 호출 시 `alcohol_consent_at` 함께 전달. 모든 부스 orders row 에 동일 timestamp 기록 (다부스 결제도 1개 결제 = 1번 동의).

주류 메뉴 없는 주문은 `alcohol_consent_at = NULL`.

---

## 6. 부스앱 — 주문 카드 강조

`src/pages/BoothDashboardPage.tsx` (또는 부스앱 주문 카드 컴포넌트):

주문 아이템 중 `is_alcohol === true` 인 메뉴가 1개라도 있으면:

- 카드 좌측 보더 빨간색 (`#C53030`, 4px)
- 카드 상단에 빨간 배지 `🍺 주류 — 신분증 확인 필수` (눈에 띄게, 14~16px bold)
- 주류 메뉴 라인은 빨간 글씨 + 메뉴명 옆에 `🍺` 아이콘
- 일반 메뉴 라인은 기존 색상 그대로

[준비완료] 버튼 클릭 시 한 번 더 confirm:
```
이 주문에는 주류가 포함되어 있습니다.
손님 신분증을 확인하셨습니까?

[다시 확인]      [확인했음, 준비완료]
```

이 confirm 도 사후 분쟁용 증거로 (`prepared_at` 시점에 confirm 통과한 것으로 간주).

---

## 7. 손님 주문 상태 페이지

`src/pages/OrderStatusPage.tsx` — 주문에 주류 포함 시 메타박스에 빨간 안내 라인:

```
🍺 픽업 시 신분증을 반드시 지참해주세요.
   미성년자 / 신분증 미제시 시 주류는 환불됩니다.
```

[준비완료] 알림 받았을 때 한 번 더 강조 (배너 아래 추가 라인).

---

## 8. 환불 처리 — 신분증 미제시 케이스

별도 코드 변경 불필요. 세션 27 의 부스 단위 환불 그대로 사용.

다만 어드민 환불 모달에 안내 추가:
- 환불 사유 textarea 위에 hint 텍스트:
  > "주류 환불 시: '신분증 미제시'라고 사유 기록 권장"

기록 표준화 목적. 강제 X.

---

## 9. 확정 사항 (질문 금지)

| Q | 결정 |
|---|---|
| 주류 식별 방식 | `food_menus.is_alcohol` 단일 BOOLEAN 컬럼. tags 자유 텍스트 미채택 |
| 동의 형식 | 모달 + 체크박스 + [동의하고 결제] 버튼 |
| 동의 기록 | `orders.alcohol_consent_at` timestamp. 다부스 결제는 모든 row 동일 값 |
| 미성년 인증 방식 | 자기신고 (PASS 본인인증 X). 실질 검증은 매장 픽업 시 |
| 부스앱 강조 | 빨간 보더 + 배지 + 준비완료 confirm |
| 손님 화면 안내 | 주문 상태 페이지에 빨간 라인 |
| 다부스 결제 시 모달 | 주류 1개라도 있으면 1회 노출 |
| 주류만 거절 / 다른 메뉴는 제공 | 운영진이 부스 단위 환불 (세션 27 흐름) |
| 환불 사유 강제 표준화 | X. hint 텍스트로 권장만 |

---

## 10. 검증 절차 — 작업 완료 후 사용자 실행

### 10-1. 어드민

- [ ] 메뉴 편집 모달에 "주류 메뉴" 체크박스 노출
- [ ] 체크 후 저장 → 메뉴 목록에 `🍺 주류` 배지 표시
- [ ] 체크 해제 후 저장 → 배지 사라짐

### 10-2. 손님 결제

- [ ] 일반 메뉴만 장바구니 → 결제 시 모달 안 뜸 (기존 흐름)
- [ ] 주류 메뉴 1개 포함 → 결제 클릭 시 모달 등장
- [ ] 체크박스 미체크 → [동의하고 결제] disabled
- [ ] [취소] → 결제 안 됨, 장바구니 유지
- [ ] [동의하고 결제] → 결제 정상 진행, DB `alcohol_consent_at` timestamp 기록
- [ ] 주류 + 일반 메뉴 혼합 → 모달 1회만 (주류 1개라도 있으면 트리거)
- [ ] 다부스 결제 (주류 매장 + 일반 매장) → 모달 1회 + 모든 부스 orders row 에 동일 consent timestamp

### 10-3. 부스앱

- [ ] 주류 주문 카드 → 빨간 보더 + 배지 + 빨간 메뉴 글씨
- [ ] 일반 주문 카드 → 기존 디자인 그대로
- [ ] 혼합 주문 카드 → 빨간 보더 + 배지 (주류 1개라도 있으면)
- [ ] [준비완료] 클릭 → confirm 모달 → 통과해야 처리됨

### 10-4. 손님 주문 상태 페이지

- [ ] 주류 주문 → 메타박스에 빨간 신분증 안내 노출
- [ ] [준비완료] 알림 받을 때도 강조 라인 노출

### 10-5. DB 검증

```sql
-- 주류 메뉴 등록 확인
SELECT id, name, is_alcohol FROM food_menus WHERE is_alcohol = TRUE;

-- 동의 timestamp 기록 확인
SELECT id, alcohol_consent_at, status
FROM orders 
WHERE alcohol_consent_at IS NOT NULL
ORDER BY created_at DESC LIMIT 10;

-- 다부스 결제 시 모든 row 동일 timestamp 인지
SELECT payment_id, COUNT(DISTINCT alcohol_consent_at) AS distinct_ts
FROM orders
WHERE alcohol_consent_at IS NOT NULL
GROUP BY payment_id
HAVING COUNT(DISTINCT alcohol_consent_at) > 1;
-- 빈 결과 = 정합 (모든 부스 row 가 같은 timestamp)
```

---

## 11. 빌드 검증

`npx tsc --noEmit` 통과 확인.

---

## 12. 커밋

```
feat(alcohol): age verification consent for alcohol menu

- Add is_alcohol flag to food_menus
- Add alcohol_consent_at timestamp to orders
- Show consent modal in checkout for alcohol items
- Add visual emphasis (red border, badge) on booth dashboard
- Require confirm dialog before marking alcohol orders ready
- Display ID notice on customer order status page
```

dev push 까지.

---

## 13. 후속 작업 (별도 페이즈 — 본 페이즈 외)

- 동의 모달 다국어 대응 (영문 손님 케이스)
- PASS 본인인증 연동 (행사 후 검토)
- 주류 매출 별도 통계 분리 (현재는 일반 매출에 합산)
- 주류 환불 사유 통계 (신분증 미제시 빈도 추적)
