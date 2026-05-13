# 헬프데스크 키오스크 v1 — 검증 시나리오

> 구현 보고: `helpdesk_kiosk_v1_구현보고.md`
> 마이그레이션: `_DEV/Seeds/40_kiosk_payment_channel.sql`
> 작업 범위: `/kiosk` 라우트 + 결제 대기 큐 + 통계 채널 분리 + force-reset broadcast
> 작성일: 2026-05-13

---

## 0. 사전 준비

- [ ] `_DEV/Seeds/40_kiosk_payment_channel.sql` Supabase SQL Editor 실행
- [ ] 기존 도우미 데이터 백필 확인:
  ```sql
  SELECT payment_channel, COUNT(*) FROM orders GROUP BY payment_channel;
  -- app: 기존 PWA 결제 / helpdesk: 기존 결제 도우미 + 신규 키오스크
  ```
- [ ] 빌드 정상: `npm run build` (tsc + vite 모두 0 errors)
- [ ] 어드민 계정 준비:
  - `musanfesta` / `123456` (super)
  - `admin01` ~ `admin03` / `M12345678!` (helper)
- [ ] 테스트 매장 + 일반 메뉴 1개 이상 + 주류 메뉴 1개 (`is_open=true && is_paused=false`)
- [ ] 손님 휴대폰 1개 (검증 SMS/알림톡은 부스 ready 단계에서 발송됨, 결제 완료 시점은 X)

---

## 1. 접근 / 라우트 검증

### 1-1. /kiosk 풀스크린 진입 (admin 호스트)

1. `http://admin.localhost:5173/kiosk` (로컬) 또는 `https://admin.musanfesta.com/kiosk` (prod) 접속
   - [ ] 사이드바·헤더 없는 **풀스크린 컨테이너** (AdminLayout 외부)
   - [ ] 상단 헤더 좌측: `설악무산문화축전 · 헬프데스크` 브랜드
   - [ ] 상단 헤더 우측: `처음으로` 버튼 (RotateCcw 아이콘, strokeWidth 1.2)
   - [ ] 페이지 진입 시 장바구니 자동 비움 (localStorage 잔여 데이터 제거)

### 1-2. customer 호스트에서 차단

1. `http://localhost:5173/kiosk` (customer 호스트) 진입
   - [ ] `/kiosk` 라우트 매칭 X (HomePage 또는 404 거동)
   - 손님 PWA 도메인에는 노출 안 됨 (`FloatingInstallButton` 충돌 방지 의도)

### 1-3. 어드민 인증 미요구

1. 어드민 로그아웃 후 `/kiosk` 직접 접속
   - [ ] 인증 게이트 없이 진입 가능 (키오스크는 손님이 만지는 화면이라 로그인 미요구)

---

## 2. menu step — 3컬럼 레이아웃

### 2-1. 기본 UI

1. `/kiosk` 진입 (menu step 기본)
   - [ ] 좌측(320px): 부스 리스트 (`is_open=true && is_paused=false` 만)
   - [ ] 중앙(1fr): 첫 번째 부스의 메뉴 그리드 (auto-fill 220px+)
   - [ ] 우측(480px): 빈 장바구니 + 합계 0원 + 비활성 결제 버튼

### 2-2. 부스 전환

1. 좌측 부스 항목 클릭
   - [ ] 활성 부스가 검정색 배경으로 강조
   - [ ] 중앙 메뉴 그리드가 그 부스 메뉴로 즉시 갱신
   - [ ] 중앙 헤더에 `{booth_no}번 · {부스명}` + `description` (있으면)

### 2-3. 메뉴 카드 표시

1. 메뉴 카드 디테일 확인
   - [ ] 이미지(있으면) / 없으면 placeholder gradient
   - [ ] 메뉴명 + 가격 (xxx,xxx원)
   - [ ] 주류 메뉴: 좌상단 빨간 배지 `🍺 주류` (strokeWidth 1.2)
   - [ ] 품절 메뉴: 우상단 검은 배지 `품절` + 카드 흐림 + 클릭 비활성

### 2-4. 장바구니 담기

1. 일반 메뉴 카드 클릭
   - [ ] 우측 장바구니에 행 추가 (`{부스명}` / `{메뉴명}` / `{소계}원`)
   - [ ] 메뉴 카드 우하단에 수량 배지(`1`) 표시
   - [ ] 우측 합계 갱신
2. 같은 메뉴 카드 다시 클릭
   - [ ] 같은 행 수량 +1 (중복 행 생성 X), 배지 `2`
3. 다른 부스 메뉴 클릭
   - [ ] 장바구니에 별도 행 추가 (부스명 다르게 표시)

### 2-5. 장바구니 수량/삭제

1. 우측 행의 `−` 버튼
   - [ ] 수량 1 감소. 0 도달 시 행 자동 제거
2. `+` 버튼
   - [ ] 수량 +1
3. 휴지통 아이콘
   - [ ] 행 즉시 제거

### 2-6. 결제 요청 버튼

1. 장바구니 비어있을 때
   - [ ] 우측 `결제 요청` 버튼 비활성 (회색)
2. 1개 이상 담은 후
   - [ ] 버튼 활성 (검은색)
   - [ ] 클릭 → phone step 으로 전환

---

## 3. phone step — 큰 키패드

### 3-1. 기본 UI

1. menu → phone 전환 후
   - [ ] 좌측: 안내 문구 + 디스플레이(빈 placeholder `010-0000-0000`) + 합계 + `[메뉴로][결제 요청]` 버튼
   - [ ] 우측(720px): 3×4 키패드 (1-9 + 빈칸 + 0 + ⌫ 백스페이스)
   - [ ] 헤더 `처음으로` 버튼 여전히 노출

### 3-2. 키패드 입력

1. 키패드로 `01012345678` 11자리 입력
   - [ ] 디스플레이가 `010-1234-5678` 으로 자동 하이픈 포맷
   - [ ] 11자리 초과 입력은 무시
2. 백스페이스 (⌫) 클릭
   - [ ] 한 자리씩 제거
3. 11자리 완성 시
   - [ ] 우측 `결제 요청` 버튼 활성 (검은색)
4. 8자리 미만 입력 시
   - [ ] 디스플레이 아래 빨간 힌트 `11자리 010 번호를 입력해주세요`
   - [ ] 결제 요청 버튼 비활성

### 3-3. `메뉴로` 버튼

1. `메뉴로` 클릭
   - [ ] menu step 으로 복귀. 장바구니 유지.

### 3-4. 결제 요청 (성공 케이스)

1. 11자리 입력 후 `결제 요청` 클릭
   - [ ] 버튼이 `요청 중…` 으로 변하며 비활성
   - [ ] 1초 내 waiting step 으로 전환

**검증 SQL** (결제 요청 직후):
```sql
-- 신규 payments + orders 인서트 확인
SELECT id, phone, total_amount, status, payment_method
FROM payments
ORDER BY created_at DESC LIMIT 1;
-- status='pending', payment_method='cash' (placeholder)

SELECT order_number, booth_no, booth_name, subtotal,
       status, payment_channel, payment_method, paid_at
FROM orders
WHERE payment_id = (SELECT id FROM payments ORDER BY created_at DESC LIMIT 1);
-- status='payment_pending', payment_channel='helpdesk', payment_method=NULL, paid_at=NULL
```

### 3-5. 결제 요청 (실패 — 통신 오류 등)

1. 네트워크 끊기 후 결제 요청
   - [ ] 에러 박스 노출 (`결제 요청 실패: …`)
   - [ ] 버튼 활성 복귀, 재시도 가능

---

## 4. waiting step — 결제 대기

### 4-1. 기본 UI

1. 결제 요청 직후 waiting step 진입
   - [ ] 큰 카드 중앙 배치: `직원에게 카드 또는 현금을 제시해주세요`
   - [ ] CreditCard / Wallet 아이콘 80px, strokeWidth 1.2
   - [ ] 부스별 주문번호 리스트 (`A01-0513-0001` 등)
   - [ ] 헤더 `처음으로` 버튼 **숨김** (waiting 단계에서는 손님 빠져나가는 경로 차단)
   - [ ] 하단 dot 3개 깜빡이는 애니메이션

### 4-2. realtime 결제완료 감지 → done 전환

(§6 어드민 결제 처리 후 자동으로 다음 단계 검증됨 — 거기서 함께 확인)

---

## 5. 어드민 — 결제 대기 큐 + 결제 처리

### 5-1. 키오스크 대기 탭 진입

1. 어드민(`musanfesta` 또는 `admin01`) 로그인 → `/help-desk` 진입
2. 탭 바 확인
   - [ ] `주문 입력` / `키오스크 대기` / `금일 결제 내역` / `시재 관리` 4개 탭
3. `키오스크 대기` 탭 클릭
   - [ ] 상단 툴바: 좌측 `대기 N건` 카운트, 우측 `새로고침` + `키오스크 초기화` 버튼
   - [ ] 손님이 결제 요청한 카드가 즉시 표시 (realtime)

### 5-2. 큐 카드 표시

1. 카드 1건 확인
   - [ ] 상단: `010-1234-5678` (formatPhoneDisplay) + `대기 X초/분`
   - [ ] 중단: 부스 칩 (`A01번 · 분식집`) 1개 이상
   - [ ] 하단: 총 결제 금액 (큰 폰트)

### 5-3. 결제 처리 모달

1. 카드 클릭
   - [ ] 모달 오픈
   - [ ] 헤더: `결제 처리` + 전번
   - [ ] 부스별 상세 (부스명, 소계, 메뉴 라인업)
   - [ ] 총 결제 금액 표시
   - [ ] `[카드][현금]` 큰 버튼 2개
   - [ ] `[취소][결제 완료]` 액션
   - [ ] 결제수단 미선택 시 `결제 완료` 비활성

### 5-4. 카드 결제 완료 처리

1. `카드` 클릭 → `결제 완료` 클릭
   - [ ] 처리 중 비활성 → 완료 후 토스트 `결제 완료 처리됨`
   - [ ] 큐에서 해당 카드 사라짐
   - [ ] 키오스크 화면이 자동으로 done step 으로 전환됨

**검증 SQL**:
```sql
SELECT p.status, p.payment_method, p.assisted_by, p.paid_at
FROM payments p
WHERE p.id = '<paymentId>';
-- status='paid', payment_method='external_card', assisted_by='admin01', paid_at NOT NULL

SELECT order_number, status, payment_channel, payment_method, paid_at
FROM orders WHERE payment_id = '<paymentId>';
-- status='paid', payment_channel='helpdesk', payment_method='card', paid_at NOT NULL
```

### 5-5. 현금 결제 완료 처리 (별도 손님)

1. 키오스크에서 다시 결제 요청 → 어드민에서 큐 진입
2. `현금` 클릭 → `결제 완료`
3. **검증 SQL**:
```sql
SELECT p.payment_method FROM payments p WHERE p.id = '<paymentId>';
-- payment_method='cash'

SELECT payment_method FROM orders WHERE payment_id = '<paymentId>';
-- payment_method='cash'
```

### 5-6. 모달 취소

1. 카드 클릭 → 결제수단 선택 안 한 채 `취소`
   - [ ] 모달 닫힘, 큐 상태 변동 없음
2. 모달 외부(오버레이) 클릭
   - [ ] 동일하게 모달 닫힘

### 5-7. realtime — 새 결제 요청 즉시 반영

1. 어드민 큐 탭 열어둔 채 키오스크에서 결제 요청
   - [ ] 새 카드 새로고침 없이 즉시 등장 (orders INSERT realtime)
2. 다른 카드 처리 (paid) → 본인 화면 큐에서 해당 카드 사라짐 (UPDATE realtime)

---

## 6. 키오스크 측 — paid 자동 전환 + done step

### 6-1. waiting → done

1. 어드민에서 결제 완료 처리한 직후, 키오스크 화면 관찰
   - [ ] 1-2초 이내에 자동으로 done step 전환 (payments.status='paid' realtime)
   - [ ] 큰 체크 아이콘 + `결제 완료` 메시지
   - [ ] 카운트다운 `5초 → 4 → 3 → 2 → 1`
   - [ ] 0 도달 시 menu step 으로 자동 리셋 + 장바구니 클리어

### 6-2. realtime 미스 fallback

(시뮬레이션 어려움 — payments 직접 update 했을 때 1차 fetch 가 catch 함. 코드 리뷰로 확인)

---

## 7. 무동작 타임아웃 + 처음으로 버튼

### 7-1. 3분 무동작 → 자동 리셋

1. menu step 진입 후 메뉴 1개 담고 **3분 대기** (테스트 시 코드의 `IDLE_TIMEOUT_MS` 잠시 축소 권장)
   - [ ] 2분 55초 시점에 토스트 `잠시 후 처음 화면으로 돌아갑니다`
   - [ ] 3분 정각에 menu 로 자동 리셋 + 장바구니 클리어
2. 터치/클릭/키입력 발생 시 타이머 리셋되어 카운트 다시 시작

### 7-2. phone step 에서도 동일 적용

- [ ] phone step 에서 3분 무동작 → 자동 리셋

### 7-3. waiting step 에서는 미적용

1. waiting step 진입 후 5분 이상 방치
   - [ ] 자동 리셋 안 됨 (직원 처리 대기 중이므로 핸드오프 §1-7(a) 명시)

### 7-4. done step 카운트다운만 작동

- [ ] done step 의 5초 자동 리셋은 무동작 타임아웃과 독립적

### 7-5. 처음으로 버튼 — 빈 장바구니

1. menu step 진입 (장바구니 비어있음)
2. 헤더 `처음으로` 클릭
   - [ ] 확인 모달 없이 즉시 메인 리셋 (그대로 menu, 장바구니 0)

### 7-6. 처음으로 버튼 — 장바구니 있음

1. menu step 에서 메뉴 담은 상태
2. `처음으로` 클릭
   - [ ] 확인 모달 노출: `처음부터 다시 시작할까요?` + `[취소][다시 시작]`
3. `취소` → 모달 닫힘, 상태 유지
4. `다시 시작` → menu 리셋 + 장바구니 클리어

### 7-7. phone step 에서 처음으로

1. phone step 에서 일부 입력한 상태
2. `처음으로` 클릭
   - [ ] (장바구니 있으면) 확인 모달 → 다시 시작 → menu + 장바구니 + phone 입력 모두 클리어

### 7-8. waiting step 에서 처음으로 불가

- [ ] 헤더 `처음으로` 버튼 자체가 숨겨져 있어 클릭 불가

---

## 8. 어드민 키오스크 초기화 (force-reset broadcast)

### 8-1. waiting step 중 강제 리셋

1. 키오스크: 결제 요청 후 waiting step 진입
2. 어드민(`키오스크 대기` 탭): `키오스크 초기화` 버튼 클릭
   - [ ] 어드민 화면에 토스트 `키오스크 초기화 요청 보냄`
   - [ ] 키오스크 화면이 즉시 menu 로 리셋 (장바구니/대기 정보 모두 클리어)
3. 큐에는 해당 orders 가 여전히 남음 (status='payment_pending')
   - 직원이 별도로 모달 진입 → 결제 완료 처리 또는 SQL 로 cancel 필요

### 8-2. menu / phone step 중 강제 리셋

1. 키오스크: menu 에서 메뉴 담은 상태
2. 어드민에서 `키오스크 초기화`
   - [ ] 키오스크 즉시 menu 리셋 + 장바구니 클리어

### 8-3. 어드민 자기 화면에는 영향 없음

- [ ] 어드민에서 broadcast 보내도 어드민 큐 탭은 그대로 작동

---

## 9. 통계 — 채널별 매출 분리

### 9-1. 매출관리 탭 진입

1. `super` 계정으로 `/revenue` 또는 매출관리 탭
2. `채널별 매출 (앱 / 헬프데스크)` 섹션 확인
   - [ ] `앱 결제` (xxx원 · N건 · X%)
   - [ ] `헬프데스크 결제` (xxx원 · N건 · X%)
   - [ ] `헬프데스크 — 카드` (xxx원 · N건)
   - [ ] `헬프데스크 — 현금` (xxx원 · N건)
   - [ ] (식권 100% 결제 있으면) `헬프데스크 — 기타` 카드
   - [ ] `합계` (강조 표시)

### 9-2. 새 결제 후 매출 갱신 확인

1. 키오스크 결제 1건 (카드) 완료
2. 매출 탭 새로고침
   - [ ] 헬프데스크 카드 매출이 정확히 +1건/+해당 금액 증가
   - [ ] 합계 갱신

### 9-3. 기존 결제 도우미 (직원 직접 입력) 도 헬프데스크로 집계

1. `주문 입력` 탭에서 어드민 직접 입력 결제 1건 (현금)
2. 매출 탭 새로고침
   - [ ] 헬프데스크 현금 매출에 반영 (백필 + 신규 모두)

---

## 10. 부스 대시보드 연계 (paid 후 정상 흐름)

### 10-1. 부스에 paid 주문 노출

1. 키오스크 → 어드민 결제완료 처리 → 키오스크 done 전환 (5-1 ~ 6-1)
2. 부스 앱 (`booth.*` 호스트) 해당 부스 로그인
   - [ ] 신규 주문 카드 등장 (status='paid', 미확인)
   - [ ] 부스앱 알림 사운드 (`audioCue`) 재생 (기존 로직)
3. 부스앱에서 `확인` → `준비완료` → `픽업완료` 전체 흐름 정상
   - [ ] 손님에게 픽업 알림톡 발송 (기존 `sendPickupAlimtalk` 트리거, `markBoothOrderReady` 시점)

### 10-2. 부스 대시보드에 payment_pending 노출 안 됨

1. 키오스크 결제 요청만 한 채 (직원 처리 전) 부스앱 확인
   - [ ] payment_pending 행은 부스 화면에 절대 노출 안 됨 (`boothOrders.ts:44` 필터)

---

## 11. 회귀 검증 — 기존 흐름 영향 없음

### 11-1. 손님 PWA 결제

1. `musanfesta.com` (customer 호스트) → `/cart` → `/checkout` → 쿠키페이 결제
   - [ ] 정상 결제 (status pending → paid)
   - [ ] orders.payment_channel='app' (default)
   - [ ] orders.payment_method=NULL

### 11-2. 기존 결제 도우미 (`주문 입력` 탭)

1. `admin01` 로 `/help-desk` → `주문 입력` 탭 → 현금 결제
   - [ ] 정상 처리
   - [ ] 신규 orders.payment_channel='app' 으로 기록됨 ⚠
   - **주의**: 이 흐름은 v1 마이그레이션에서 백필만 적용되어 신규 결제는 `payment_channel='app'` 으로 들어간다. 신규 결제 도우미 결제도 'helpdesk' 로 분류하려면 `HelpDeskOrderTab.tsx` 의 `createPendingPayment` 호출 시 `payment_channel='helpdesk'` 명시 필요 (v2 후보, 구현보고 §6-3 미해당이라 별도 fix).

> 위 11-2 결과에 따라 추가 fix 필요 여부 결정.

### 11-3. AdminOrders (`/orders`) 의 STATUS_LABEL

1. `/orders` 진입, status 필터 = `payment_pending` 인 행 있을 때
   - [ ] 상세 모달의 부스별 진행 상태에 `결제대기(헬프)` 라벨 표시

---

## 12. SQL 검증 모음 (수시 확인용)

```sql
-- 1. 마이그레이션 적용 확인
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name='orders' AND column_name IN ('payment_channel','payment_method');

-- 2. status enum 갱신 확인
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'orders'::regclass AND conname = 'orders_status_check';
-- expect: ... CHECK (status IN ('pending','payment_pending','paid','confirmed','completed','cancelled'))

-- 3. 백필 결과
SELECT payment_channel, payment_method, COUNT(*)
FROM orders GROUP BY payment_channel, payment_method ORDER BY 1, 2;

-- 4. 현재 키오스크 대기 큐
SELECT o.order_number, o.booth_name, o.subtotal, p.phone, o.created_at
FROM orders o JOIN payments p ON o.payment_id = p.id
WHERE o.status='payment_pending' AND o.payment_channel='helpdesk'
ORDER BY o.created_at;

-- 5. 키오스크 결제 완료 행 (오늘)
SELECT o.order_number, o.booth_name, o.payment_method, o.paid_at, p.assisted_by
FROM orders o JOIN payments p ON o.payment_id = p.id
WHERE o.payment_channel='helpdesk'
  AND o.status='paid'
  AND o.paid_at::date = (now() AT TIME ZONE 'Asia/Seoul')::date
ORDER BY o.paid_at DESC;

-- 6. 채널별 매출 (오늘)
SELECT
  o.payment_channel,
  o.payment_method,
  COUNT(DISTINCT o.payment_id) AS payment_count,
  SUM(o.subtotal) AS revenue
FROM orders o
WHERE o.status='paid'
  AND o.paid_at::date = (now() AT TIME ZONE 'Asia/Seoul')::date
GROUP BY o.payment_channel, o.payment_method
ORDER BY 1, 2;

-- 7. 손님 이탈 의심 — 1시간 이상 payment_pending
SELECT o.order_number, o.booth_name, p.phone,
  EXTRACT(EPOCH FROM (now() - o.created_at))/60 AS waiting_minutes
FROM orders o JOIN payments p ON o.payment_id = p.id
WHERE o.status='payment_pending'
  AND o.created_at < now() - INTERVAL '1 hour'
ORDER BY o.created_at;
```

---

## 13. 알려진 한계 / v1 미구현 (구현보고 §6 참고)

- payments.payment_method 가 결제 요청 시점에 placeholder `'cash'` 로 채워짐 (cancel 안 되면 paid 시점에 실제 method 로 덮어쓰기). 통계 영향 없음, payments 직접 보는 사람 헷갈릴 수 있음.
- payment_pending 손님 이탈 cancel UI 부재 → SQL 로 직접 처리 (`docs/kiosk-operation.md` §5).
- 키오스크 v1 미지원: 쿠폰/식권/포장/알코올 동의 모달/메뉴 검색·필터.
- 부스 실시간 품절·일시중지 미반영 (직원이 강제 리셋으로 처리).
- 신규 결제 도우미(`주문 입력` 탭) 결제는 `payment_channel='app'` 으로 기록 — 위 §11-2 참고 (v1 후속 fix 후보).

---

## 14. 검증 종료 체크

- [ ] 모든 §1 ~ §11 정상 통과
- [ ] §12 SQL 결과 예상대로 (백필·신규·통계)
- [ ] §13 한계 사항 운영 가능 수준인지 사용자 결정 — 운영 가능하면 dev 머지 / 추가 fix 필요하면 별도 핸드오프
