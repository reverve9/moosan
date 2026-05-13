# Realtime Architecture

> 무산문화축전 — Supabase Realtime (postgres_changes + broadcast) 사용 지점 단일 참조 문서.
> 코드 변경 시 함께 업데이트. v1 fix (2026-05-13) 기준.

---

## 1. postgres_changes 구독 (DB 변경 감지)

| 위치 | 채널명 | 테이블 | 필터 | 사용처 / 트리거 UI |
|---|---|---|---|---|
| `src/lib/boothMonitor.ts:143` (`subscribeMonitor`) | `admin-alert-context-orders` | `orders` | 없음 (전체 INSERT/UPDATE/DELETE) | `AdminAlertContext` → `fetchMonitorSummary()` 재호출 → 부스 모니터 카드 + 경고 배지 |
| `src/lib/boothOrders.ts:207` (`subscribeBoothOrders`) | `booth-orders-{boothId}-orders` | `orders` | `booth_id=eq.{boothId}` (UPDATE) | 부스 대시보드 — 새 paid 주문 카드 등장, 부스 음 효과 |
| `src/lib/boothOrders.ts:243` (`subscribeBoothOrders` 동일 함수) | `booth-orders-{boothId}-items` | `order_items` | 없음 (전체 INSERT/UPDATE) | 부스 대시보드 — 주문 라인 변경 즉시 반영 |
| `src/components/food/FoodSections.tsx:115` (메뉴 페이지) | `food-booths-{slug}-realtime` | `food_booths` | 없음 | 부스 `is_open`/`is_paused` 토글 즉시 반영 |
| `src/components/food/FoodSections.tsx:218` | `food-menus-{slug}-realtime` | `food_menus` | 없음 | 메뉴 `is_sold_out` 토글 즉시 반영 |
| `src/pages/CartPage.tsx:152` | `cart-page-orders` | `orders` | `phone=eq.{phone}` | 손님 PWA 장바구니에서 오늘 주문 내역 갱신 |
| `src/pages/OrderStatusPage.tsx:155` | `order-status-{orderId}` | `orders` | `id=eq.{orderId}` | 손님 PWA 주문 상태 페이지 — confirmed/ready/picked_up 전이 실시간 표시 |
| `src/pages/admin/helpdesk/HelpDeskKioskQueueTab.tsx:70` | `helpdesk-kiosk-queue` | `orders` | 없음 (INSERT + UPDATE) | 어드민 결제 대기 큐 — `fetchKioskPendingQueue` 재호출로 카드 갱신 |
| `src/pages/kiosk/steps/WaitingStep.tsx:47` | `kiosk-payment-{paymentId}` | `payments` | `id=eq.{paymentId}` (UPDATE) | 키오스크 — 직원이 결제 완료 처리 시 `status='paid'` 감지 → done step 자동 전환 |

### 1-1. REPLICA IDENTITY 설정

`12_payments_booth_orders.sql:279-281` 에서 `payments`, `orders`, `order_items` 에 `REPLICA IDENTITY FULL` 설정.
→ non-PK 컬럼(`booth_id`, `phone` 등) 필터링이 realtime payload 에서 정상 동작.

---

## 2. Broadcast 채널 (DB 거치지 않는 직접 신호)

| 채널명 패턴 | 이벤트 | 송신측 | 수신측 |
|---|---|---|---|
| `kiosk:helpdesk-1` | `force-reset` | 어드민 `HelpDeskKioskQueueTab` → `sendKioskForceReset('helpdesk-1')` | 키오스크 #1 `KioskPage` (URL `?station=helpdesk-1`) → `resetToMenu()` |
| `kiosk:helpdesk-2` | `force-reset` | 어드민 `HelpDeskKioskQueueTab` → `sendKioskForceReset('helpdesk-2')` | 키오스크 #2 `KioskPage` (URL `?station=helpdesk-2`) → `resetToMenu()` |

송신측 헬퍼: `src/lib/helpDesk.ts:sendKioskForceReset(stationId)`
수신측 구독: `src/pages/kiosk/KioskPage.tsx` — `supabase.channel(`kiosk:${stationId}`).on('broadcast', { event: 'force-reset' }, ...)`

각 키오스크는 **자신의 station 채널만 구독**. 어드민 큐 탭 화면에는 어떤 broadcast 도 수신하지 않음 (구독 없음 → 자신이 보낸 메시지에 영향 X).

---

## 3. 공통 주의사항

### 3-1. self 옵션
현재 broadcast 채널 모두 기본 `self:true` (송신자도 수신). 어드민→키오스크 흐름은 어드민이 force-reset 을 구독하지 않으므로 영향 없음. 향후 어드민에서도 같은 채널을 구독하는 케이스 생기면 `{ config: { broadcast: { self: false } } }` 명시 필요.

### 3-2. 연결 해제·재연결
Supabase JS 가 자동 재연결. 단:
- 키오스크 `WaitingStep` 진입 시 1차로 payments.status 한 번 fetch → realtime 미스 보정.
- 어드민 큐 탭에는 수동 "새로고침" 버튼 제공.

### 3-3. 알려진 한계

- 키오스크 메뉴 페이지(`MenuStep`)는 부스 `is_open`/`is_sold_out` realtime 구독을 가져오지 않음 (운영 1대 + 직원 옆에 있다는 가정). 필요해지면 `FoodSections` 의 패턴을 차용.
- broadcast 채널은 메시지 보관 안 함 — 키오스크가 꺼져있을 때 송신된 force-reset 은 유실. 재기동 시 자동 menu 상태로 시작하므로 운영상 무해.

---

## 4. 채널 명명 규칙 (권장)

- `{도메인}-{서브목적}` 케밥 케이스. 예: `admin-alert-context-orders`, `booth-orders-{boothId}-orders`.
- Broadcast 는 `{도메인}:{식별자}` 콜론 표기. 예: `kiosk:helpdesk-1`.
- 새 채널 추가 시 본 문서 §1 또는 §2 표에 한 줄 추가.
