# 헬프데스크 키오스크 v1 fix — 구현 완료 보고

> 원 지시문: `helpdesk_kiosk_v1_fix_및_2대운영지시.md`
> 작업일: 2026-05-13
> 빌드: **통과** (tsc + vite, 1956 modules)

---

## 1. 변경 / 신규 파일 목록

### 1-1. 신규 (마이그레이션·문서·컴포넌트)

| 경로 | 설명 |
|---|---|
| `_DEV/Seeds/41_kiosk_payment_method_revert.sql` | orders.payment_method 드롭 + payments.payment_method NULL 허용 |
| `_DEV/Seeds/42_kiosk_station_id.sql` | orders.kiosk_station_id 컬럼 ('helpdesk-1'/'helpdesk-2'/NULL) |
| `src/pages/kiosk/AlcoholConsentModal.tsx` | 키오스크 주류 동의 모달 |
| `src/pages/kiosk/AlcoholConsentModal.module.css` | 모달 스타일 |
| `docs/realtime-architecture.md` | postgres_changes + broadcast 사용처 단일 참조 문서 |

### 1-2. 수정

| 경로 | 변경 |
|---|---|
| `src/types/database.ts` | orders.payment_method 제거, orders.kiosk_station_id 추가, payments.payment_method NULL 허용, `KioskPaymentMethod`='external_card'\|'cash', `KioskStationId` 신규 export |
| `src/lib/orders.ts` | `createKioskPaymentPending` — placeholder 'cash' 제거, payment_method=NULL, kiosk_station_id/couponId/voucherDistributions 옵션 추가. `CreatePaymentInput.paymentChannel` 옵션 추가 |
| `src/lib/helpDesk.ts` | `confirmKioskPayment` — payments.payment_method update + `markPaymentPaid` 호출 패턴으로 변경, method 도메인 'external_card'\|'cash'\|'voucher_only'. `KioskQueueGroup` 에 `voucherConsumed`, `kioskStationId` 추가. `sendKioskForceReset(stationId)` 인자화 |
| `src/lib/adminStats.ts` | `calcPaymentChannelStats` 의 카드/현금 분리를 `payments.payment_method` 기준으로 변경 |
| `src/pages/admin/helpdesk/HelpDeskOrderTab.tsx` | `createPendingPayment` 호출 시 `paymentChannel: 'helpdesk'` 명시 |
| `src/pages/admin/helpdesk/HelpDeskKioskQueueTab.tsx` | StationBadge 카드 배지, 키오스크 #1/#2 초기화 버튼 2개, 식권 차감 표시, 잔액 0 케이스 '식권 결제 완료' 단일 버튼, method 도메인 'external_card' |
| `src/pages/admin/helpdesk/HelpDeskKioskQueueTab.module.css` | 배지·식권 칩·voucher info row 스타일 |
| `src/pages/kiosk/KioskPage.tsx` | `useSearchParams` 로 station 받기, 동적 force-reset 채널 `kiosk:{stationId}`, 알코올 모달 흐름, 헤더 #N 배지 |
| `src/pages/kiosk/KioskPage.module.css` | brand 영역 station 배지 스타일 |
| `src/pages/kiosk/steps/PhoneStep.tsx` | stationId/alcoholConsentAt props, 식권 코드 입력 영역 + validateCouponByCode + calcVoucherSettlement, voucher 정보 createKioskPaymentPending 으로 전달 |
| `src/pages/kiosk/steps/PhoneStep.module.css` | voucher 입력 블록 스타일 |
| `docs/kiosk-operation.md` | 3계정 운영 구조 + station 파라미터 박힌 Chrome 명령어 + 키오스크 #1/#2 초기화 버튼 안내 |

---

## 2. 마이그레이션 SQL

### 2-1. `_DEV/Seeds/41_kiosk_payment_method_revert.sql`

```sql
BEGIN;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_method_check;
ALTER TABLE orders DROP COLUMN IF EXISTS payment_method;

ALTER TABLE payments ALTER COLUMN payment_method DROP NOT NULL;

COMMIT;
```

**실행 순서**: 40 → 41 → 42. 만약 40 만 이미 실행됐다면 41/42 를 추가로 실행하면 됨.

### 2-2. `_DEV/Seeds/42_kiosk_station_id.sql`

```sql
BEGIN;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS kiosk_station_id TEXT;

DO $$ BEGIN
  ALTER TABLE orders
    ADD CONSTRAINT orders_kiosk_station_id_check
    CHECK (kiosk_station_id IS NULL OR kiosk_station_id IN ('helpdesk-1', 'helpdesk-2'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_orders_kiosk_station_id
  ON orders(kiosk_station_id, created_at DESC)
  WHERE kiosk_station_id IS NOT NULL;

COMMIT;
```

**검증**:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name='orders' AND column_name='payment_method';
-- 0 rows (41 적용 후)

SELECT column_name, is_nullable FROM information_schema.columns
WHERE table_name='payments' AND column_name='payment_method';
-- is_nullable='YES'

SELECT column_name, data_type FROM information_schema.columns
WHERE table_name='orders' AND column_name='kiosk_station_id';
-- 1 row, text
```

---

## 3. 식권 관련 위치 매핑

| 항목 | PWA / HelpDeskOrderTab 위치 | 키오스크 이식 위치 |
|---|---|---|
| 식권 검증 API | `src/lib/coupons.ts:721` `validateCouponByCode(code, subtotal)` | `src/pages/kiosk/steps/PhoneStep.tsx` 의 `handleVoucherApply` 에서 동일 함수 호출 |
| 식권 부스 분배 | `src/lib/coupons.ts:772` `calcVoucherSettlement(booths, voucherAmount)` | `src/pages/kiosk/steps/PhoneStep.tsx` `useMemo(settlement)` |
| 식권 ↔ 결제 흐름 통합 | `src/pages/admin/helpdesk/HelpDeskOrderTab.tsx:172,279-307` | `src/pages/kiosk/steps/PhoneStep.tsx` `handleSubmit` (createKioskPaymentPending 인자로 couponId/voucherDistributions 전달) |
| payment_method 'voucher_only' 결정 | `HelpDeskOrderTab.tsx:296` userPaid===0 && isVoucher 분기 | `HelpDeskKioskQueueTab.tsx` 의 `handleConfirm` — `selected.totalAmount===0` 이면 method='voucher_only' 자동 결정 |
| 식권 사용량 차감 | `markPaymentPaid` 내 coupon 'used' 전이 (`src/lib/orders.ts:206-225`) | 동일 경로 — `confirmKioskPayment` 가 `markPaymentPaid` 호출하면 자동 처리 |

**§3-1 준수**: 쿠폰 자동 감지 로직(`fetchAvailableCouponsByPhone`) 이식하지 않음. 손님이 식권 코드 직접 입력하는 형태로 구현.
**§3-5 준수**: PWA 결제 흐름 코드는 일체 수정하지 않음 (CheckoutPage, coupons.ts 자체 수정 X).

---

## 4. 알코올 메뉴 판별 컬럼

PWA·키오스크 모두 **동일 컬럼 사용**: `food_menus.is_alcohol` (boolean, `src/types/festival_extras.ts:70`).

장바구니 항목으로 변환 시 `CartItem.isAlcohol` 에 복사 (`MenuStep.tsx` 의 `handleAdd`). 키오스크 결제 요청 단계에서 `items.some((i) => i.isAlcohol === true)` 으로 모달 트리거 결정 (`KioskPage.tsx:handleGoToPhone`).

DB 저장은 `orders.alcohol_consent_at` (timestamp). createKioskPaymentPending → KioskPage 상태(alcoholConsentAt) → PhoneStep prop → insert.

---

## 5. 자체 점검 결과

| 항목 | 결과 |
|---|---|
| `tsc` (`npm run build` 의 tsc -b 단계) | **통과 (0 error)** |
| `vite build` | **통과** (1956 modules, 508ms) |
| 빌드 산출물 | dist/assets/index-DBk0OThJ.js 921KB (기존 chunk size 경고만 유지) |

---

## 6. v1 → v1 fix 한계 갱신

### v1 §6 한계 중 해결된 것

- ✅ **§6-1 payments.payment_method 'cash' placeholder** — 41 마이그로 NULL 허용. `createKioskPaymentPending` 에서 NULL 인서트. 결제 처리 시점에 update.
- ✅ **§6-3 키오스크 v1 미지원 — 쿠폰/식권/알코올 동의** — 식권 + 알코올 동의 이식 완료. (쿠폰은 §3-1 결정에 따라 미이식)
- ✅ **§7 §11-2 신규 결제 도우미 payment_channel='app' 누락** — `HelpDeskOrderTab` 호출에 `paymentChannel: 'helpdesk'` 명시.

### v1 §6 중 여전히 남은 한계

- **§6-2 payment_pending 손님 이탈 cancel UI** — 여전히 SQL 직접 처리 (`docs/kiosk-operation.md` §5 안내). v2 후보.
- **§6-3 미지원 항목** 중 **포장(takeout) 옵션** / **메뉴 검색·필터** — 그대로 미구현. v2 후보.
- **§6-4 broadcast self:false 미설정** — 어드민이 키오스크 채널 구독 안 하므로 영향 없음. v2 에서 명시성 위해 추가 검토.
- **§6-5 부스 실시간 품절·일시중지** — 미구현. 직원이 강제 리셋으로 처리. v2 후보.

### v1 fix 에서 새로 발견된 사항

- **식권 코드 입력 UX**: 스탠바이미 풀스크린 + Chrome --kiosk 모드에서 영문/숫자 식권 코드 입력 시 OS 가상 키보드 노출 여부는 환경 의존적. 운영 1대 + 직원 옆에 있으므로 직원이 노트북 키보드로 대신 입력하는 fallback 가능. 검증 시나리오에 명시 권장.
- **2대 운영 환경에서 같은 손님이 양쪽 키오스크에 동시 결제 요청**: 가능하지만 운영상 자연 발생 어려움. 어드민 큐는 모두 한 자리에서 보므로 직원이 시각적으로 식별·처리. 별도 잠금 미구현.

---

## 7. 다음 단계 (검증 진입 가능)

1. **마이그 41, 42 실행** (Supabase Dashboard 또는 CLI). 41 의 DROP COLUMN 이 데이터 손실 없는지 확인 (40 의 백필 데이터는 컬럼 드롭으로 자연 소멸).
2. **로컬 검증** — `npm run dev` 후:
   - 키오스크 #1: `http://admin.localhost:5173/kiosk?station=helpdesk-1`
   - 키오스크 #2: `http://admin.localhost:5173/kiosk?station=helpdesk-2`
   - 어드민: `http://admin.localhost:5173/help-desk` → 키오스크 대기 탭
3. **별도 턴의 검증 프롬프트** 받아서 E2E 시나리오 진행.

---

## 8. 작업 단계별 커밋 분할 (제안)

핸드오프 §7 의 7단계 권장 그대로 커밋 분리 가능:

1. `feat(kiosk): payment_method revert 41 마이그 + 코드 정정`
2. `feat(kiosk): station_id 42 마이그 + URL 파라미터 + force-reset 채널 일반화`
3. `feat(kiosk): 어드민 큐 배지 + 키오스크 #1/#2 초기화 버튼 분리`
4. `feat(kiosk): 알코올 동의 모달`
5. `feat(kiosk): 식권 사용 로직 이식`
6. `docs: realtime architecture`
7. `docs: 운영 매뉴얼 v1 fix 업데이트`

사용자가 검증 후 일괄 단일 커밋 또는 단계별 분할 선택 가능.
