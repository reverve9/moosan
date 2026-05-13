# 헬프데스크 키오스크 v1 — 착수 보고

> 원 구현 지시문: `helpdesk_kiosk_implementation_prompt_v1_1.md`
> 작성일: 2026-05-13
> 상태: **착수 전 정렬 단계** (구현 시작 전 사용자 결정 대기)

---

## §A. 코드베이스 정독 요약

### A-1. 라우팅 (hostname 기반 3분기)

`src/App.tsx:52-58` — hostname 으로 `customer | booth | admin` 모드 분기.

```
prod  : musanfesta.com (손님) / booth.musanfesta.com / admin.musanfesta.com
dev   : musanfesta-dev.vercel.app (손님) / booth-musanfesta-dev... / admin-musanfesta-dev...
local : localhost:5173 / booth.localhost:5173 / admin.localhost:5173
```

`AdminRoutes` 는 항상 `<AdminLayout>` 으로 래핑 (사이드바·헤더 포함). 키오스크는 풀스크린이라 **Layout 없이 standalone** 로 등록해야 함.

### A-2. 기존 결제·주문 흐름 (요지)

```
[손님 PWA]
   CheckoutPage → createPendingPayment() → Toss 결제창 → success
                                                            ↓
                                              markPaymentPaid(paymentId, paymentKey)
                                                            ↓
                              payments.status='paid', orders.status='paid', paid_at=now()

[현행 헬프데스크 (어드민 직원이 입력)]
   AdminHelpDesk → HelpDeskOrderTab → createPendingPayment(paymentMethod='external_card'|'cash'|'voucher_only')
                                                            ↓
                                              markPaymentPaid(payment.id, null)
                                                            ↓
                                              즉시 paid (Toss 우회)

[부스 대시보드]
   subscribeBoothOrders 로 orders.status IN ('paid','confirmed','completed') 만 받음
   confirmBoothOrder() → status='confirmed'
   markBoothOrderReady() → ready_at (status 유지)
   markBoothOrderPickedUp() → status='completed'

[알림톡]
   sendPickupAlimtalk() — markBoothOrderReady() 시점에서 호출되는 것으로 추정
   결제 완료 직후 알림톡은 별도 트리거 (구현 시점에 정확한 지점 재확인 필요)
```

### A-3. orders 테이블 현재 정의 (`_DEV/Seeds/12_payments_booth_orders.sql`)

```sql
status TEXT NOT NULL DEFAULT 'pending'
  CHECK (status IN ('pending', 'paid', 'confirmed', 'completed', 'cancelled'))
```

TypeScript 동기화 위치 (`src/types/database.ts:881/908/935`).

### A-4. payments.payment_method 는 이미 존재

```ts
payment_method: 'pg' | 'external_card' | 'cash' | 'voucher_only'
```

→ 핸드오프 §1-4 의 "`orders.payment_method` 추가" 는 **이미 payments 테이블에 있는 정보의 중복** 일 가능성 있음. 결정 포인트 §C-2 참고.

### A-5. 재사용 가능 자산

| 자산 | 경로 | 키오스크 활용 방식 |
|---|---|---|
| `useCart()` (`clear()` 포함) | `src/store/cartStore.tsx` | 키오스크 진입/리셋 시 `clear()` |
| `FoodSections` (부스/메뉴 그리드 + realtime) | `src/components/food/FoodSections.tsx` | 가로 3컬럼 레이아웃 내부에서 일부 추출 재사용 |
| `createPendingPayment` | `src/lib/orders.ts:58` | 결제 요청 시 호출 (단, `payment_pending` status 신규 분기 필요) |
| `markPaymentPaid` | `src/lib/orders.ts:175` | 어드민 결제완료 처리 시 호출 (기존 그대로) |
| `subscribeBoothOrders` 패턴 | `src/lib/boothOrders.ts:207` | 키오스크용 realtime 구독 신규 작성 시 동일 패턴 차용 |
| `AdminAlertContext` realtime | `src/components/admin/AdminAlertContext.tsx` | 어드민 결제 대기 큐 구독 시 패턴 차용 |

### A-6. 마이그레이션 컨벤션

- 위치: `_DEV/Seeds/{번호}_{기능명}.sql` (타임스탬프 X, 순번)
- 다음 번호: **40** (최근 `39_cookiepay_columns.sql`)
- 헬프데스크 키오스크용: `40_kiosk_payment_channel.sql` 예정

### A-7. Realtime Broadcast 사용 사례

현재 코드베이스에 **broadcast 채널 사용처 없음**. 모두 `postgres_changes` (DB 변화 감지) 만 사용. 핸드오프 §1-7(c) 의 직원 강제 리셋용 `kiosk:helpdesk-1` 채널은 **신규 패턴**.

### A-8. 스타일·디자인

- **CSS Modules** (Tailwind 미사용). 페이지/컴포넌트별 `.module.css`.
- **Lucide 아이콘**: 전역 strokeWidth 설정 없음. 코드 전반은 기본값(2). 핸드오프 §1-3 의 "strokeWidth 1.2 기본" 은 키오스크에 한정 적용 권장.
- 글로벌 `--max-width: 600px` 토큰은 손님 PWA 에만 적용. 키오스크 page 에서 `max-width` 해제 필요.

---

## §B. 마이그레이션 영향 범위

### B-1. 신규 마이그레이션 SQL (안)

```sql
-- _DEV/Seeds/40_kiosk_payment_channel.sql
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_channel TEXT NOT NULL DEFAULT 'app'
    CHECK (payment_channel IN ('app', 'helpdesk'));

-- status enum 갱신
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('pending', 'payment_pending', 'paid', 'confirmed', 'completed', 'cancelled'));

CREATE INDEX IF NOT EXISTS idx_orders_payment_pending
  ON orders(status) WHERE status = 'payment_pending';
```

> `orders.payment_method` 추가는 결정 포인트 §C-2 보고 결정.

### B-2. TypeScript / 코드 동기화 필수 위치

| 파일 | 변경 |
|---|---|
| `src/types/database.ts:881/908/935` | orders.status union 에 `'payment_pending'` 추가 |
| `src/types/database.ts` (Row/Insert/Update) | orders 에 `payment_channel` 컬럼 추가 |
| `src/pages/admin/AdminOrders.tsx:58-93` | STATUS_LABEL 에 `payment_pending` 표시 추가 |
| `src/lib/boothOrders.ts:44` | `.in('status', ['paid','confirmed','completed'])` 필터 — **수정 불필요** (키오스크 결제 대기 주문이 부스에 노출되면 안 됨) |
| `src/lib/orders.ts:58` (`createPendingPayment`) | 키오스크 분기에서 status='payment_pending' 직접 insert 하는 별도 함수 신규 작성 권장 (기존 함수 분기 추가는 응집도 낮춤) |

### B-3. 깨질 가능성 있는 기존 쿼리 확인 결과

- 통계 페이지(`StatsRevenueTab.tsx`): 매출 집계는 status 전체 가져와 client 계산. `payment_pending` 은 매출에 포함되면 안 됨 → 통계 쿼리 / 집계 함수에서 `payment_pending` 명시 제외 필요.
- 어드민 주문 관리 (`adminPayments.ts:73`): `.in('status', ['paid','cancelled'])` — `payment_pending` 자연 제외, OK.
- 부스 대시보드: 자연 제외, OK.

---

## §C. 모호한 결정 포인트 (사용자 확인 필요)

### C-1. 키오스크 라우트가 어느 hostname 에 들어가야 하는가?

**핸드오프**: "`/kiosk` 라우트 신설" — 호스트 미지정.

**후보**:
- **(a) admin 호스트** (`admin.musanfesta.com/kiosk`) — 어드민 노트북에서 두 번째 모니터로 띄우는 흐름에 가장 자연스러움. `AdminRoutes` 안에 두되 `AdminLayout` 외부에 별도 standalone 라우트 추가.
- **(b) customer 호스트** (`musanfesta.com/kiosk`) — 어드민 인증 없이 손님 도메인에서 접근 가능. 단, 손님이 우연히 URL 알면 접근 가능.
- **(c) 별도 hostname** (`kiosk.musanfesta.com`) — DNS/Vercel 도메인 설정 추가 필요. 가장 깔끔하나 운영 부담↑.

**추천**: **(a) admin 호스트**. 키오스크는 운영 도구이고, admin 도메인은 사내망/직원만 알고 있어 외부 노출 위험 낮음. 풀스크린 뷰는 Layout 없이 standalone 등록.

→ **결정 필요**: a/b/c 중 어느 것?

### C-2. `orders.payment_method` 컬럼을 정말 추가할 것인가?

**핸드오프 §1-4**: orders 에 `payment_method` 추가.
**현재 상태**: `payments.payment_method` 이미 존재 (`'pg'|'external_card'|'cash'|'voucher_only'`). orders 는 `payment_id` FK 로 접근 가능.

**추가의 장점**: 부스/통계 쿼리에서 join 안 해도 됨, 비정규화로 조회 빠름.
**추가의 단점**: 정규화 깨짐, 결제수단 변경 시 두 곳 동기화.

**추천**: **추가하지 않음**. `payments.payment_method` 만으로 충분. 키오스크 흐름에서도 어드민에서 결제완료 처리 시 `payments.payment_method` 를 `'external_card'` 또는 `'cash'` 로 채움. 통계에서는 join 으로 처리. 단, 핸드오프 문서 §2 금지사항이 아닌 §1-4 기능 명세이므로 사용자 의도 재확인 필요.

→ **결정 필요**: 추가? 미추가?

### C-3. `payment_channel` 값을 'helpdesk' 한 가지로 묶을 것인가?

**핸드오프 §1-9**: "앱 결제 매출 / 헬프데스크 매출 / 합계" — 헬프데스크 안에서 카드 vs 현금만 분리.
**현실**: 헬프데스크 결제는 **두 경로** — (i) 어드민 직원 직접 입력 (`HelpDeskOrderTab`, 현행 유지) (ii) 키오스크 셀프 (신규).

**옵션 A**: `payment_channel IN ('app', 'helpdesk')` — 두 헬프데스크 경로는 한 채널로 묶음. 통계상 헬프데스크 매출 = 직원입력 + 키오스크. 카드/현금 분리는 `payment_method` 로.
**옵션 B**: `payment_channel IN ('app', 'helpdesk_admin', 'helpdesk_kiosk')` — 세분.

**추천**: **옵션 A**. 핸드오프 §1-9 의 통계 분리 단위와 일치. 키오스크 vs 직원입력 비교가 향후 필요해지면 그때 세분 가능 (마이그레이션 부담 낮음).

→ **결정 필요**: A? B?

### C-4. 현행 `HelpDeskOrderTab` (직원이 직접 메뉴 입력) 의 운명?

**핸드오프 §1-1 배경**: "이걸 [키오스크로] 바꾼다" — 폐기 뉘앙스.
**핸드오프 §2 금지**: "기존 헬프데스크 흐름 코드 수정 금지" 는 없음. 그러나 "**`payment_channel='app'` 흐름은 전혀 건드리지 않음**" 만 명시.

**해석 후보**:
- **(a) 직원 직접 입력 보존 (폴백)** — 키오스크 고장·전번 입력 거부 손님 등 예외 케이스 대응. 신규 채널만 추가.
- **(b) 직원 직접 입력 폐기** — UI 단순화, 키오스크가 유일 진입점.

**추천**: **(a) 보존**. 폴백 가치 있음. 단, 두 흐름 모두 `payment_channel='helpdesk'` 로 같은 채널에 들어가도 OK (위 C-3 옵션 A 와 일치).

→ **결정 필요**: a? b?

### C-5. Lucide strokeWidth 1.2 적용 범위

**핸드오프 §1-3**: "Lucide 아이콘 strokeWidth `1.2` 기본".
**현실**: 코드 전반 strokeWidth=2 (기본값).

**옵션**:
- **(a) 키오스크 페이지 내부에만** 1.2 적용 (다른 화면 영향 없음).
- **(b) 전역 변경** — 어드민 UI 일관성 위해 모든 Lucide 아이콘 1.2 로.

**추천**: **(a)**. 키오스크는 손님이 보는 화면이라 디자인 의도 따르되, 어드민 기존 UI 손대는 건 범위 폭주 위험.

→ **결정 필요**: a? b? (b 면 별도 챗에서 진행 권장)

### C-6. 키오스크 결제완료 후 손님 알림톡 트리거 시점

**핸드오프 §3 결정값**: "손님 알림 → 기존 PWA 흐름 그대로 (전번 입력 → 알림톡/푸시)" — 의미가 모호.

**해석**:
- 키오스크에선 전번 입력만 받고, 알림톡 트리거는 기존 위치 그대로 (`markBoothOrderReady` 시점 픽업 알림 등).
- "결제 완료" 시점에 별도 알림톡은 보내지 않음 (PWA 흐름도 결제완료 알림톡은 별도 없음 — 확인 필요).

**추천**: **구현 단계에서 PWA 토스 success 후 알림톡 발송 위치 정확히 확인 후, 같은 트리거 위치(있다면) 또는 없으면 markPaymentPaid 직후 신규 트리거 추가**. 이번 착수 보고에서는 결정 보류, 구현 중 재확인 후 보고.

→ **결정 필요**: 결정 보류 OK? 아니면 지금 미리 정할 것?

---

## §D. 구현 단계 분할 (커밋 단위 안)

순서대로 진행, 각 단계마다 커밋 분리:

1. **DB 마이그레이션** (`_DEV/Seeds/40_kiosk_payment_channel.sql`) + TypeScript 타입 동기화
2. **/kiosk 라우트 + 3컬럼 풀스크린 레이아웃 골격** (Layout 없이 standalone, step state 머신)
3. **menu step** — 좌(부스) 중(메뉴 그리드) 우(장바구니), FoodSections 일부 재사용
4. **phone step** — 큰 키패드 + "결제 요청" → orders insert (status='payment_pending')
5. **waiting step** — realtime 으로 orders 갱신 감지, force-reset broadcast 구독
6. **done step** — 5초 카운트다운 + 자동 리셋
7. **무동작 타임아웃 (3분)** + **"처음으로" 버튼** + **확인 모달**
8. **어드민 결제 대기 큐** — `AdminHelpDesk` 내 신규 탭 또는 별도 섹션. 결제 처리 모달(카드/현금) → markPaymentPaid + payment_method 업데이트
9. **어드민 "키오스크 초기화" 버튼** — `kiosk:helpdesk-1` 채널로 force-reset broadcast
10. **통계 채널별 분리** — `StatsRevenueTab.tsx` 에 payment_channel 별 매출 + 헬프데스크 내 카드/현금 비율 섹션 추가
11. **운영 매뉴얼** — `_DEV/Operations_Manual.md` 또는 `docs/kiosk-operation.md` 신설 (Chrome 키오스크 모드, 두 번째 모니터 절차)

---

## §E. 사용자 확인 요청 (요약)

**진행 전 결정 필요 6건**:

| # | 항목 | 추천 |
|---|---|---|
| C-1 | /kiosk 호스트 위치 | (a) admin 호스트 |
| C-2 | orders.payment_method 컬럼 추가 여부 | 미추가 (payments 에 이미 있음) |
| C-3 | payment_channel 값 ('helpdesk' 한 묶음 vs 세분) | (A) 한 묶음 |
| C-4 | 현행 HelpDeskOrderTab 운명 | (a) 보존 (폴백) |
| C-5 | Lucide strokeWidth 1.2 범위 | (a) 키오스크 내부만 |
| C-6 | 결제완료 후 알림톡 트리거 | 구현 단계 재확인 (지금 보류) |

→ **사용자 응답 형식 예**: `C-1=a, C-2=미추가, C-3=A, C-4=a, C-5=a, C-6=보류` 같은 한 줄이면 됨. 변경 사항 있으면 명시.

확정되는 즉시 §D 구현 단계 1번부터 착수.
