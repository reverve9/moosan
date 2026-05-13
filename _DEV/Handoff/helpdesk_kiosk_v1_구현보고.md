# 헬프데스크 키오스크 v1 — 구현 완료 보고

> 원 지시문: `helpdesk_kiosk_implementation_prompt_v1_1.md`
> 착수 보고: `helpdesk_kiosk_v1_착수보고.md`
> 작업일: 2026-05-13
> 브랜치: `dev` (커밋 분리 없이 작업트리 변경만 — 사용자가 단계별로 검수 후 커밋 권장)

---

## 1. §C 결정사항 확정 (착수 보고 §C 기준)

| # | 결정 | 사유 |
|---|---|---|
| C-1 | **admin 호스트 / AdminLayout 외부 standalone 라우트** | 핸드오프 §2 "PWA 설치 유도 메타 추가 금지" — customer 호스트면 FloatingInstallButton 노출. admin 도메인이면 자연 차단 |
| C-2 | `orders.payment_method` 컬럼 **추가** | 핸드오프 §1-4 명시 |
| C-3 | `payment_channel IN ('app','helpdesk')` 두 값 | 핸드오프 §1-4 명시. 통계 단위와 일치 |
| C-4 | 현행 `HelpDeskOrderTab` (직원 직접 입력) **보존** | 폴백 가치. 키오스크 vs 직원입력 모두 channel='helpdesk' |
| C-5 | Lucide strokeWidth 1.2 **키오스크 내부만 적용** | §1-3 의도. 기존 어드민 UI 영향 X |
| C-6 | 결제완료 후 별도 알림톡 트리거 **없음** | PWA 흐름도 결제 완료 시 알림톡 미발송 (`sendPickupAlimtalk` 은 부스 ready 시점에만). 키오스크도 동일하게 부스 ready 시점에 자동 발송됨 |

---

## 2. 변경 / 신규 파일 목록

### 2-1. 신규

| 경로 | 설명 |
|---|---|
| `_DEV/Seeds/40_kiosk_payment_channel.sql` | orders 에 payment_channel/payment_method 컬럼, status enum 에 payment_pending 추가 + 백필 |
| `src/pages/kiosk/KioskPage.tsx` | 키오스크 메인 단일 페이지 (step state 머신 + 헤더 + idle timeout + force-reset broadcast 구독) |
| `src/pages/kiosk/KioskPage.module.css` | 풀스크린 1920×1080 컨테이너 스타일 |
| `src/pages/kiosk/ResetConfirmModal.tsx` | "처음으로" 버튼 클릭 시 장바구니 있을 때 확인 모달 |
| `src/pages/kiosk/ResetConfirmModal.module.css` | 모달 스타일 |
| `src/pages/kiosk/steps/MenuStep.tsx` | 3컬럼(부스/메뉴/장바구니) 레이아웃, FoodSections 데이터 소스 재사용 |
| `src/pages/kiosk/steps/MenuStep.module.css` | 메뉴 카드 그리드 + 장바구니 스타일 |
| `src/pages/kiosk/steps/PhoneStep.tsx` | 큰 숫자 키패드 + 전번 입력 + createKioskPaymentPending 호출 |
| `src/pages/kiosk/steps/PhoneStep.module.css` | 키패드/디스플레이 스타일 |
| `src/pages/kiosk/steps/WaitingStep.tsx` | payments[id] realtime 구독 → status='paid' 시 onPaid |
| `src/pages/kiosk/steps/WaitingStep.module.css` | 대기 화면 스타일 |
| `src/pages/kiosk/steps/DoneStep.tsx` | 결제 완료 + 5초 카운트다운 자동 리셋 |
| `src/pages/kiosk/steps/DoneStep.module.css` | 완료 화면 스타일 |
| `src/pages/admin/helpdesk/HelpDeskKioskQueueTab.tsx` | 어드민 결제 대기 큐 + 카드/현금 모달 + "키오스크 초기화" 버튼 |
| `src/pages/admin/helpdesk/HelpDeskKioskQueueTab.module.css` | 큐/모달 스타일 |
| `docs/kiosk-operation.md` | Chrome 키오스크 모드, 두 번째 모니터 절차, 트러블슈팅 |

### 2-2. 수정

| 경로 | 변경 |
|---|---|
| `src/App.tsx` | `KioskPage` import + AdminRoutes 안 AdminLayout 외부에 `/kiosk` 라우트 추가 |
| `src/types/database.ts` | orders Row/Insert/Update 에 `payment_channel`/`payment_method` 추가, status union 에 `payment_pending` 추가, `OrderStatus`/`PaymentChannel`/`KioskPaymentMethod` export 타입 추가 |
| `src/pages/admin/AdminOrders.tsx` | ORDER_STATUS_LABEL 에 `payment_pending: '결제대기(헬프)'` 추가 |
| `src/lib/adminPayments.ts` | `BoothOrderRow.order.status` union 에 `payment_pending` 추가 |
| `src/lib/orders.ts` | `createKioskPaymentPending` 함수 신규 추가 (Toss PG 미경유, status=payment_pending 인서트) |
| `src/lib/helpDesk.ts` | `fetchKioskPendingQueue` / `confirmKioskPayment` / `sendKioskForceReset` + 관련 타입 추가 |
| `src/lib/adminStats.ts` | `calcPaymentChannelStats` 함수 + 타입 추가 (채널/카드/현금 분리 집계) |
| `src/pages/admin/helpdesk/AdminHelpDesk.tsx` | "키오스크 대기" 탭 추가 (TABS 두 번째 자리) |
| `src/pages/admin/stats/StatsRevenueTab.tsx` | `ChannelSection` 신규 + 1번 섹션 다음에 렌더 |

---

## 3. 마이그레이션 SQL

`_DEV/Seeds/40_kiosk_payment_channel.sql` 전체:

```sql
BEGIN;

-- 1) payment_channel
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_channel TEXT NOT NULL DEFAULT 'app';

DO $$ BEGIN
  ALTER TABLE orders
    ADD CONSTRAINT orders_payment_channel_check
    CHECK (payment_channel IN ('app', 'helpdesk'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2) payment_method (헬프데스크 결제 수단)
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_method TEXT;

DO $$ BEGIN
  ALTER TABLE orders
    ADD CONSTRAINT orders_payment_method_check
    CHECK (payment_method IS NULL OR payment_method IN ('card', 'cash'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 3) status enum 확장 — payment_pending 추가
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders
  ADD CONSTRAINT orders_status_check
  CHECK (status IN ('pending', 'payment_pending', 'paid', 'confirmed', 'completed', 'cancelled'));

CREATE INDEX IF NOT EXISTS idx_orders_payment_pending
  ON orders(created_at DESC)
  WHERE status = 'payment_pending';

CREATE INDEX IF NOT EXISTS idx_orders_payment_channel
  ON orders(payment_channel, created_at DESC);

-- 3.5) 백필 — 기존 결제 도우미(직원 직접 입력) 데이터 helpdesk 채널로 보정
UPDATE orders o
SET payment_channel = 'helpdesk'
FROM payments p
WHERE o.payment_id = p.id
  AND p.payment_method IN ('external_card', 'cash', 'voucher_only')
  AND o.payment_channel = 'app';

UPDATE orders o
SET payment_method = 'card'
FROM payments p
WHERE o.payment_id = p.id
  AND p.payment_method = 'external_card'
  AND o.payment_method IS NULL;

UPDATE orders o
SET payment_method = 'cash'
FROM payments p
WHERE o.payment_id = p.id
  AND p.payment_method = 'cash'
  AND o.payment_method IS NULL;

COMMIT;
```

**실행 방법**: Supabase Dashboard → SQL Editor → 위 블록 붙여넣고 RUN. 또는 CLI:
```bash
psql "$DATABASE_URL" -f _DEV/Seeds/40_kiosk_payment_channel.sql
```

**검증 쿼리**:
```sql
-- 컬럼 확인
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name='orders' AND column_name IN ('payment_channel','payment_method');

-- 백필 결과
SELECT payment_channel, payment_method, COUNT(*)
FROM orders GROUP BY payment_channel, payment_method ORDER BY 1, 2;
```

---

## 4. 접속 URL

| 환경 | 키오스크 | 어드민 큐 |
|---|---|---|
| local | `http://admin.localhost:5173/kiosk` | `http://admin.localhost:5173/help-desk` (→ "키오스크 대기" 탭) |
| dev | `https://admin-musanfesta-dev.vercel.app/kiosk` (또는 dev 도메인 매핑 확인) | `https://admin-musanfesta-dev.vercel.app/help-desk` |
| prod | `https://admin.musanfesta.com/kiosk` | `https://admin.musanfesta.com/help-desk` |

Chrome 키오스크 모드:
```bash
chrome --kiosk --app=https://admin.musanfesta.com/kiosk
```
(상세는 `docs/kiosk-operation.md`)

---

## 5. 자체 점검 결과

| 항목 | 결과 |
|---|---|
| `tsc --noEmit` | **통과 (0 error)** |
| `npm run build` | **통과** (1954 modules, 593ms) — 기존 chunk size 경고만 (이번 변경 무관) |
| `/kiosk` 라우트 등록 | App.tsx AdminRoutes 안, Layout 외부 standalone — `FloatingInstallButton` 노출 X 확인 |
| TypeScript 타입 동기화 | orders.payment_channel/payment_method/status enum 3종 위치 모두 반영 |

---

## 6. 발견된 한계 / 이슈 (사용자 검증 전 공유)

### 6-1. payments.payment_method placeholder 'cash'

`createKioskPaymentPending` 호출 시점에 `payments.payment_method` 가 NOT NULL 제약 때문에 `'cash'` 로 임시 채워진다. 직원이 결제 처리 시점에 실제 값(`'external_card'` 또는 `'cash'`)으로 덮어쓰므로 paid 상태에서는 항상 정확. 단:
- **결제 대기 중 또는 손님 이탈로 cancel 처리되면** payments 행은 `payment_method='cash'` 인 채로 남는다 (status='pending' 또는 status='cancelled').
- 통계는 `orders.payment_channel`/`payment_method` 기준이라 영향 없음. 그러나 `payments` 직접 보는 사람이 헷갈릴 수 있음.

대안: payments.payment_method 도 NULL 허용으로 마이그레이션. v2 에서 검토.

### 6-2. payment_pending 단계의 손님 이탈 처리 UI 없음

손님이 "결제 요청" 누른 뒤 자리를 떠나면 orders.status='payment_pending' 인 채로 남는다. 직원이 확인하고 어드민에서 직접 cancel 해야 하는데 v1 에는 "취소" 버튼 없음. 운영 매뉴얼(`docs/kiosk-operation.md` §5)에 SQL 직접 cancel 절차 안내. v2 에서 UI 추가 권장.

### 6-3. 키오스크 v1 단순화 — 미지원 기능

다음은 v1 에서 의도적으로 제외:
- 쿠폰 / 식권 사용 (PWA·HelpDeskOrderTab 에서만 지원)
- 포장(takeout) 옵션 토글 — 키오스크 주문은 일괄 매장 식사로 처리
- 알코올 동의 모달 — 주류 메뉴는 카드에 배지만 표시 (직원이 카드/현금 받을 때 신분증 확인 운영으로 대체)
- 메뉴 검색 / 카테고리 필터

필요해지면 v2 에 단계적으로 추가.

### 6-4. force-reset broadcast 의 self:false 미설정

Supabase realtime broadcast 는 기본적으로 같은 클라이언트에서 보낸 메시지도 자신이 수신할 수 있다. 어드민이 키오스크 초기화 보낸 것이 어드민 화면 다른 곳에서 수신될 일은 없으므로(어드민은 force-reset 구독 안 함) 실무 영향 없음. 그러나 명시성 위해 `{ config: { broadcast: { self: false } } }` 옵션 v2 에 추가 검토.

### 6-5. 키오스크 메뉴의 부스 실시간 품절/일시중지 동기화 부재

`FoodSections` 의 realtime 구독(`food_booths`/`food_menus`)을 키오스크는 가져오지 않았다. 운영 1대 + 직원 옆에 있어 직원이 메뉴 변경 시 강제 리셋으로 처리 가능. 다만 결제 요청 시점에 부스가 일시중지 상태면 부스 대시보드에서 confirm 안 되는 케이스 발생 가능. v2 에서 realtime 구독 추가 권장.

---

## 7. 검증 시나리오 (제안)

사용자 검증 시 다음 순서 권장:

1. **마이그레이션 적용**: `_DEV/Seeds/40_kiosk_payment_channel.sql` 실행 → 검증 쿼리 확인
2. **로컬에서 dev 서버 기동**: `npm run dev` → admin host (`http://admin.localhost:5173/kiosk`) 풀스크린으로 접속
3. **menu step**: 좌측 부스 선택 → 메뉴 카드 클릭으로 장바구니 담기 → 우측 합계 표시 확인 → "결제 요청" 클릭
4. **phone step**: 큰 키패드로 11자리 입력 → 결제 요청 → waiting 진입
5. **어드민 측 (다른 탭/창)**: `admin.localhost:5173/help-desk` → "키오스크 대기" 탭에서 카드 등장 확인
6. **결제 처리**: 카드 클릭 → 모달 → 카드/현금 선택 → "결제 완료"
7. **키오스크 측**: realtime 으로 done step 자동 전환 → 5초 카운트다운 → menu 자동 리셋
8. **부스 대시보드 확인**: 부스앱에서 paid 주문 카드 등장 확인 (기존 흐름 정상)
9. **무동작 타임아웃 테스트**: menu step 에서 3분 대기 → 자동 리셋 확인 (5초 전 토스트)
10. **force-reset 테스트**: waiting step 진입 후 어드민에서 "키오스크 초기화" 클릭 → 키오스크 즉시 menu 리셋 + 토스트
11. **통계 채널 분리**: 매출관리 탭 → "채널별 매출 (앱 / 헬프데스크)" 섹션에 키오스크 결제가 헬프데스크로 집계되는지 확인

---

## 8. 다음 단계 (사용자 결정 사항)

1. 사용자가 본 보고를 검토 후 OK 하면 **단계별 커밋** (착수 보고 §D 단계 묶음 단위)
2. 마이그레이션 SQL 실행 (Supabase Dashboard 또는 CLI)
3. dev 배포 확인 → 검증 시나리오 실행
4. 이슈 발견 시 별도 핸드오프로 fix v1 추가

v1 에서 의도적으로 제외한 v2 후보 (위 §6 참고):
- 키오스크 쿠폰/식권/포장/알코올 동의
- payment_pending 손님 이탈 cancel UI
- 부스 일시중지/품절 realtime 구독
- payments.payment_method NULL 허용 마이그레이션
