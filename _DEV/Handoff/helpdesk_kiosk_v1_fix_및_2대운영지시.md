# 헬프데스크 키오스크 v1 — 정정 및 2대 운영 지원 (fix v1)

> 원 지시문: `helpdesk_kiosk_implementation_prompt_v1.md`
> 결정 프롬프트: `helpdesk_kiosk_v1_결정_및_진행지시.md`
> 구현 보고: `helpdesk_kiosk_v1_구현보고.md`
> 상태: **v1 정정 + 보강 작업. 검증 진입 전 필수.**

---

## §0 이번 턴의 목적

v1 구현 보고 검토 결과, **결정 위반 1건** + **운영 시나리오 변경에 따른 보강 4건** 을 처리한다. 검증 프롬프트는 본 작업 완료 후 별도 턴으로 전달.

---

## §1 결정 위반 정정 — C-2 (`orders.payment_method` 드롭)

### 1-1. 위반 내용

결정 프롬프트(`helpdesk_kiosk_v1_결정_및_진행지시.md` §1, §3)에서 다음을 명시했으나 구현이 반영되지 않음:

> **C-2 확정값**: `orders.payment_method` 컬럼 **추가하지 않음**. `payments.payment_method` 만 사용 (이미 `'pg' | 'external_card' | 'cash' | 'voucher_only'` 존재). 원 구현 지시문 §1-4 의 해당 부분은 **취소**. 결제 수단 enum 은 `'external_card'` / `'cash'`.

구현은 `orders.payment_method TEXT IN ('card','cash')` 를 추가하는 방향으로 진행됨. 이를 **되돌린다**.

### 1-2. 정정 작업

**(a) 새 마이그레이션 파일 신설** — `_DEV/Seeds/41_kiosk_payment_method_revert.sql`:

```sql
BEGIN;

-- orders.payment_method 컬럼 드롭
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_method_check;
ALTER TABLE orders DROP COLUMN IF EXISTS payment_method;

-- payments.payment_method NOT NULL → NULL 허용 (payment_pending 단계 placeholder 제거)
ALTER TABLE payments ALTER COLUMN payment_method DROP NOT NULL;

COMMIT;
```

> **주의**: `40_kiosk_payment_channel.sql` 은 **수정하지 말 것**. 이미 실행됐을 가능성이 있어 멱등성을 위해 별도 41번으로 분리한다. 40번에 백필 UPDATE 가 있는데 `orders.payment_method` 부분이 있다면 그 효과는 41번 DROP COLUMN 으로 자연 소멸하므로 무시 가능.

**(b) `createKioskPaymentPending` 인서트 로직 수정**:
- `payments.payment_method` 에 placeholder `'cash'` 박지 말 것. NULL 인서트.
- `orders` 인서트 시 `payment_method` 필드 제거.

**(c) 어드민 결제 처리 (`confirmKioskPayment` 또는 동등 함수)**:
- 직원이 카드/현금 선택 후 "결제 완료" 클릭 시:
  - `payments.payment_method` 를 `'external_card'` 또는 `'cash'` 로 **업데이트**
  - `markPaymentPaid(paymentId, paymentKey=null)` 호출
- 두 동작 순서·트랜잭션은 기존 `HelpDeskOrderTab` 의 결제 처리 패턴과 일치시킬 것.

**(d) TypeScript 타입 동기화**:
- `src/types/database.ts` 에서 `orders.payment_method` 제거
- export 한 `KioskPaymentMethod` 타입은 `'external_card' | 'cash'` 로 정의 (기존 payments enum 값 그대로 차용)
- `OrderStatus`, `PaymentChannel` 은 그대로 유지

**(e) 어드민 큐 모달 라벨**:
- 버튼 라벨은 UI 친화적으로 `"카드"` / `"현금"` 유지 (DB 값은 `'external_card'` / `'cash'`)
- 매핑은 컴포넌트 내부에서 처리

**(f) 통계 화면**:
- `StatsRevenueTab.tsx` 의 `ChannelSection` — 헬프데스크 내 카드/현금 분리 표시를 `orders` 단독 쿼리에서 `payments` join 으로 변경
- 기존 `calcPaymentChannelStats` 의 그룹핑 키를 `payments.payment_method` 기준으로 (단, `payment_channel='helpdesk'` 필터 후)
- 시각화 컴포넌트는 그대로 재사용

### 1-3. 영향 확인

- `40` 마이그레이션의 백필 UPDATE 중 `orders.payment_method` 관련 행은 컬럼 드롭으로 자연 소멸 — 데이터 손실 없음 (애초에 운영 데이터 없음)
- `payment_channel` 백필은 `41` 에서 건드리지 않으므로 그대로 유효

---

## §2 알코올 동의 모달 — 키오스크 추가

### 2-1. 요구사항

키오스크에서 주류 메뉴가 장바구니에 담긴 채 "결제 요청" 누르는 경우 모달 띄운다.

- 모달 카피(예): **"만 19세 이상이며, 직원이 신분증 확인 후 인계됨에 동의합니다."**
- 체크박스 1개 + `[취소]` `[동의하고 결제 요청]` 버튼
- 동의 시에만 `phone` step 또는 결제 요청 진행
- 장바구니에 주류 메뉴 없으면 모달 스킵

### 2-2. 구현 위치

- PWA 측에 알코올 동의 흐름이 이미 있다면 **컴포넌트 재사용**. 없으면 신규 작성 (`src/pages/kiosk/AlcoholConsentModal.tsx`)
- 주류 메뉴 판별 기준: 기존 `food_menus` 테이블의 알코올 플래그 컬럼 사용 (구현 보고 §6-3 에 "주류 메뉴는 카드에 배지만 표시" 라고 했으니 판별 컬럼은 이미 존재함)

### 2-3. 흐름

- `menu` step → 결제 요청 클릭 → 알코올 메뉴 포함 여부 체크 → 포함 시 모달 → 동의 시 `phone` step → 미포함 시 바로 `phone` step
- 동의 사실은 별도 DB 저장 안 함 (운영적 동의이며, 신분증 확인 책임은 직원 SOP)

---

## §3 식권 사용 로직 — 키오스크에 이식

### 3-1. 요구사항

- 키오스크에서도 식권 사용 가능
- **쿠폰 자동 감지 로직은 이식하지 않음** — 만족도조사가 폐지되어 PWA 코드도 주석 처리된 상태. 기존 PWA의 쿠폰 관련 코드(주석 처리 포함)는 **건드리지 말 것**
- 식권 단독 결제 + 식권 + 추가 금액(카드/현금) 혼합 결제 둘 다 지원

### 3-2. PWA 흐름 참조

- PWA 결제 페이지의 식권 입력·검증·차감 로직 위치를 식별
- 키오스크 `phone` step 직전 또는 직후에 **식권 입력 영역** 추가 (전번 입력과 별도 또는 통합. 운영 흐름에 자연스러운 쪽 선택)
- 식권 코드 입력 → 검증 → 차감 금액 표시 → 잔여 금액(있다면) 직원에게 카드/현금 결제

### 3-3. 어드민 처리 변경

식권 + 추가 금액 케이스에서 직원 결제 처리 시:

- `payments.payment_method` 처리 기준이 모호해질 수 있음. 다음 중 기존 `HelpDeskOrderTab` 의 처리 방식을 따른다:
  - 식권 단독 → `'voucher_only'`
  - 식권 + 카드 → `'external_card'` (식권 차감 후 잔액을 카드로)
  - 식권 + 현금 → `'cash'`
- 정확한 처리는 `HelpDeskOrderTab` 코드 확인 후 동일 패턴으로 통일

### 3-4. 어드민 큐 모달 UI

기존 카드/현금 2버튼에서 식권 사용 케이스 대응 추가:

- 식권 사용 주문은 큐 카드에 `[식권]` 배지 표시
- 결제 처리 모달에서 식권 사용 금액·잔액 정보 표시
- 잔액 0 이면 "식권 결제 완료" 단일 버튼, 잔액 있으면 "카드/현금" 선택

UI 디테일은 기존 `HelpDeskOrderTab` 의 식권 처리 모달과 시각적 일관성 유지.

### 3-5. 절대 건드리지 말 것

- PWA 의 만족도조사 관련 주석 처리된 코드 — **그대로 둘 것**
- PWA 의 쿠폰 발급/적용 로직 — 키오스크에 이식하지 말 것
- 본 작업이 PWA 의 결제 흐름 자체에 영향 주면 안 됨 (식권 로직을 키오스크로 *복사·이식*; PWA 코드 자체 수정 금지)

---

## §4 키오스크 2대 운영 지원

### 4-1. 운영 구조 (확정)

현장 헬프데스크 부스 운영 계획:

| 계정 | 머신 | 역할 |
|---|---|---|
| #1 | 노트북 단독 | 직원 직접 메뉴 입력 (`HelpDeskOrderTab` 폴백, C-4 결정) |
| #2 | 노트북 + 터치모니터 | 키오스크 #1 |
| #3 | 노트북 + 터치모니터 | 키오스크 #2 |

총 3개의 어드민 계정. 모든 계정이 같은 결제 대기 큐를 본다.

### 4-2. station_id 주입 — URL 파라미터

- 키오스크 URL: `/kiosk?station=helpdesk-1` 또는 `?station=helpdesk-2`
- 파라미터 없으면 기본값 `helpdesk-1` (로컬 테스트 편의)
- 클라이언트에서 `useSearchParams` 등으로 읽어 컴포넌트 상태로 보관
- 운영 매뉴얼(`docs/kiosk-operation.md`) 의 Chrome 키오스크 실행 명령에 파라미터 박힌 URL 명시

### 4-3. orders 컬럼 추가 — `kiosk_station_id`

`_DEV/Seeds/42_kiosk_station_id.sql`:

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

- `createKioskPaymentPending` 인서트 시 URL 파라미터에서 받은 station_id 채움
- `HelpDeskOrderTab`(직원 직접 입력) 흐름은 NULL 유지

### 4-4. force-reset broadcast 채널 일반화

- 채널명을 하드코딩 `kiosk:helpdesk-1` 에서 동적으로 `kiosk:{station_id}` 로 변경
- 키오스크 측: 자신의 station_id 채널만 구독
- 어드민 측: 두 채널 각각 broadcast 가능 (버튼 2개)

### 4-5. 어드민 결제 대기 큐 — 배지 표시

큐 카드에 출처 배지 표시 (필터링은 안 함, 모든 큐 항목 모두에게 공통 노출):

| 출처 | 배지 표시 |
|---|---|
| 키오스크 #1 (`kiosk_station_id='helpdesk-1'`) | `[키오스크 #1]` |
| 키오스크 #2 (`kiosk_station_id='helpdesk-2'`) | `[키오스크 #2]` |
| 직원 직접 입력 (`kiosk_station_id IS NULL`) | `[직원입력]` |

배지 색·스타일은 시인성 위주 (`[키오스크 #1]` 과 `#2` 는 서로 다른 색 권장).

### 4-6. 어드민 "키오스크 초기화" UI — 버튼 2개

기존 단일 "키오스크 초기화" 버튼을 다음으로 변경:

- `[키오스크 #1 초기화]` `[키오스크 #2 초기화]` 버튼 2개 나란히 배치
- 각 버튼 옆/아래에 마지막 활동 시각(있다면) 작게 표시 — broadcast 송신 시각 또는 가장 최근 해당 station 의 order 생성 시각 기준 (구현 단계에서 자연스러운 쪽)
- 클릭 시 해당 channel 로만 broadcast, 확인 모달 없이 즉시 송신 + 토스트 ("키오스크 #N 초기화 요청 보냄")

---

## §5 리얼타임 구조 정리 문서

`docs/realtime-architecture.md` 신설. 다음 항목 정리:

1. **postgres_changes 구독 목록**
   - 위치(파일/함수) / 구독 테이블 / 필터(`status` 등) / 사용처 / 트리거되는 UI 동작
   - 예: 부스 대시보드(`subscribeBoothOrders`), 어드민 알림 컨텍스트(`AdminAlertContext`), 키오스크 `WaitingStep`(`payments[id]`) 등 — 빠짐없이
2. **Broadcast 채널 목록**
   - 채널명 패턴(`kiosk:{station_id}`) / 이벤트명(`force-reset`) / 송신측 / 수신측
3. **공통 주의사항**
   - `self:false` 옵션 명시 여부
   - 연결 해제·재연결 시 동작
   - 알려진 한계(구현 보고 §6-4 같은 것)

이 문서는 향후 디버깅·확장 시 단일 참조 지점 역할. 분량은 1~2페이지 이내. 코드 변경 시 함께 업데이트되는 살아있는 문서로 설계.

---

## §6 운영 매뉴얼 업데이트 (`docs/kiosk-operation.md`)

기존 매뉴얼에 다음 항목 추가/수정:

- 운영 구조(§4-1 표) 명시
- 각 노트북별 Chrome 키오스크 실행 명령어 — station 파라미터 박힌 URL:
  ```bash
  # 계정 #2 노트북 (키오스크 #1)
  chrome --kiosk --app="https://admin.musanfesta.com/kiosk?station=helpdesk-1"

  # 계정 #3 노트북 (키오스크 #2)
  chrome --kiosk --app="https://admin.musanfesta.com/kiosk?station=helpdesk-2"
  ```
- 두 번째 모니터(터치모니터) 확장·풀스크린 절차 (기존 내용 유지)
- 트러블슈팅: 키오스크가 다른 station 으로 잘못 떴을 때 URL 확인 절차

---

## §7 작업 단위 분할 (커밋 단위 안)

순서대로 진행, 각 단계마다 커밋 분리 권장:

1. 마이그레이션 41 (payment_method revert) + 코드 정정
2. 마이그레이션 42 (kiosk_station_id) + URL 파라미터 처리 + force-reset 채널 일반화
3. 어드민 큐 배지 + 초기화 버튼 2개 분리
4. 알코올 동의 모달
5. 식권 사용 로직 이식
6. 리얼타임 구조 문서 신설
7. 운영 매뉴얼 업데이트

---

## §8 금지 사항

- ❌ `40_kiosk_payment_channel.sql` 수정 (이미 실행됐을 수 있음 — 41번으로 분리 처리)
- ❌ PWA 결제 흐름 코드 수정 (식권 로직은 *복사·이식*, PWA 자체 수정 금지)
- ❌ PWA 의 만족도조사·쿠폰 관련 주석 처리된 코드 정리·삭제 (그대로 둘 것)
- ❌ `HelpDeskOrderTab` 흐름 수정 (C-4 폴백 보존)
- ❌ 모든 어드민 큐 카드를 station 별로 필터링 (배지 표시만)
- ❌ 자체 E2E·통합 테스트 시도 (검증은 별도 턴)

---

## §9 완료 후 보고 형식

1. 변경/신규 파일 목록 (수정 vs 신규 구분)
2. 마이그레이션 41, 42 SQL (별도 코드블록)
3. 식권 관련 PWA 코드 식별 위치 + 키오스크 이식 위치 (사용자가 추적 가능하게)
4. 알코올 메뉴 판별 컬럼 식별 결과 (PWA·키오스크 동일 기준 사용 확인)
5. 자체 빌드/타입체크 결과
6. 새 한계·이슈 발견 시 공유 (v1 §6 의 항목 중 본 fix 로 해결된 것·여전히 남은 것 구분 표기)

본 작업 완료 후 별도 턴의 **검증 프롬프트** 가 전달된다. 이번 턴에서는 E2E 시도 금지, 구현 완료 보고에서 멈출 것.
