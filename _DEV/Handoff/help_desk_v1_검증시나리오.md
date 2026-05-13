# 결제 도우미 v1 — 검증 시나리오

> 커밋: `db3ca93` (DB+auth) / `3169c18` (page) / `062f95a` (refund branch)
> Seed: `_DEV/Seeds/34_helpdesk_payment.sql`
> 작업 범위: `payments.payment_method/assisted_by/external_receipt_no`, `cash_sessions`, `/admin/help-desk` 3탭, 환불 method 별 분기

---

## 사전 준비

- [ ] `_DEV/Seeds/33_alcohol_menu.sql` 적용 완료 (도우미 결제에서 주류 분기 검증)
- [ ] `_DEV/Seeds/34_helpdesk_payment.sql` Supabase SQL Editor 실행 → 마지막 검증 쿼리로 컬럼/테이블 생성 확인
- [ ] dev 환경 또는 prod 빌드 정상 배포
- [ ] 어드민 계정:
  - `musanfesta` / `123456` (super, 전체)
  - `admin01` / `M12345678!` (helper, 헬프데스크만)
- [ ] 테스트용 매장 + 일반 메뉴 + 주류 메뉴 등록 상태
- [ ] 테스트용 식권/할인쿠폰 (선택 — 식권 케이스 검증 시)

---

## 1. 어드민 다중 계정 + 역할 분기

### 1-1. super 계정 (musanfesta) — 전체 메뉴

1. `admin.{도메인}` 진입, `musanfesta` / `123456` 로그인
2. 사이드바 확인
   - [ ] **운영** 그룹에 `결제 도우미` 메뉴 노출 (HandHeart 아이콘)
   - [ ] 기존 메뉴(공지/참가/쿠폰/매출/정산/모니터/주문/매장/계정/QR) 모두 노출
3. 사이드바 상단 로그인 표시
   - [ ] `로그인 운영본부` 라벨 노출

### 1-2. helper 계정 (admin01) — 헬프데스크만

1. 로그아웃 후 `admin01` / `M12345678!` 로그인
2. 자동으로 `/help-desk` 진입 (또는 redirect)
   - [ ] 사이드바에 `결제 도우미` 메뉴만 노출 (다른 메뉴 모두 숨김)
   - [ ] 사이드바 상단 `로그인 도우미01` 라벨
3. 다른 경로 직접 접근 (예: `/notices`, `/orders`, `/coupons`)
   - [ ] 즉시 `/help-desk` 로 redirect

### 1-3. 레거시 호환 회귀

1. 브라우저 sessionStorage 에 직접 `admin_auth=true` 만 세팅 (키 직접 set)
2. 어드민 페이지 새로고침
   - [ ] 자동으로 `musanfesta` super 세션으로 마이그레이션 (사이드바 전체 메뉴 + 운영본부 라벨)
3. 비고: 정식 검증 후 sessionStorage 초기화 → 정상 로그인 흐름 사용

---

## 2. 주문 입력 탭 (Tab 1)

### 2-1. UI 기본 검증

1. `admin01` 로 `/help-desk` 진입, **`주문 입력`** 탭 (기본 활성)
2. 좌측: 매장 필터 칩 + 메뉴 검색 + 메뉴 그리드 / 우측: 카트 sticky
   - [ ] 매장 필터 (`전체 매장` + 각 매장) 노출 (`is_open=true && is_paused=false` 만)
   - [ ] 메뉴 카드: 부스번호·매장명 + 메뉴명 + 가격
   - [ ] 주류 메뉴는 메뉴명 빨간색 + `🍺` prefix
   - [ ] 품절 메뉴는 disabled (회색, 클릭 불가, `품절` 라벨)

### 2-2. 카트 조작

1. 메뉴 카드 클릭 → 카트 추가
   - [ ] 카트 행에 메뉴명/수량/가격 표시
   - [ ] 같은 메뉴 다시 클릭 시 수량 +1 (중복 행 X)
2. 카트 행 `+` / `−` 버튼
   - [ ] 수량 정상 조절 / 0 도달 시 행 자동 제거
3. `×` 버튼 → 행 즉시 제거

### 2-3. 휴대폰 + 보유 쿠폰 (선택)

1. 휴대폰 입력 (`010-XXXX-XXXX`)
   - [ ] 11자리 완성 시 보유 쿠폰 자동 조회 (해당 번호로 발급된 활성 쿠폰)
2. 보유 쿠폰 라디오 선택
   - [ ] 할인쿠폰: 최소 주문액 미달 시 disabled (회색)
   - [ ] 식권: `[잔액 소멸]` 안내 (식권 액수 > 매장 합계 시)
3. `사용 안 함` 라디오로 복귀 가능

### 2-4. 결제 방식 선택

1. 결제 방식 토글: `현금` / `외부 카드`
   - [ ] 기본 `현금`
2. `외부 카드` 선택 시
   - [ ] `영수증 번호 *` 필드 노출 (필수)

### 2-5. 메모 (옵션)

- 자유 메모 textarea, 결제 후 `payments.meta.helper_memo` 에 저장

### 2-6. 주류 inline 경고

1. 주류 메뉴 카트에 추가
   - [ ] 빨간 배너 `🍺 주류 포함 주문` + 설명 + `☐ 신분증 확인했습니다` 체크박스
2. 체크 OFF 상태에서 `[결제 완료]` 클릭
   - [ ] 버튼 disabled 또는 에러 `주류 포함 주문 — 신분증 확인 체크 후 결제`
3. 체크 ON → 결제 정상 진행

### 2-7. 케이스 A — 단일 부스 현금 결제

1. 일반 메뉴 1개 (예: 6,000원), 휴대폰 X, 현금 선택
2. `[결제 완료]` 클릭
   - [ ] 토스트 또는 `결제 완료 (6,000원). 부스에서 픽업 안내드리세요`
   - [ ] 카트 자동 초기화

**검증 SQL:**
```sql
SELECT id, payment_method, assisted_by, total_amount, status, paid_at
FROM payments
WHERE assisted_by = 'admin01'
ORDER BY created_at DESC LIMIT 1;
-- payment_method='cash', assisted_by='admin01', status='paid', paid_at NOT NULL
```

### 2-8. 케이스 B — 다부스 외부카드 결제

1. 카트에 매장 A + 매장 B 메뉴 1개씩 (총 10,000원)
2. 외부 카드 선택, 영수증 번호 `TX-TEST-001` 입력
3. 결제 완료
   - [ ] 정상 처리

**검증 SQL:**
```sql
SELECT p.id, p.payment_method, p.external_receipt_no, p.total_amount, COUNT(o.id) AS booth_count
FROM payments p JOIN orders o ON o.payment_id = p.id
WHERE p.assisted_by = 'admin01' AND p.payment_method = 'external_card'
GROUP BY p.id ORDER BY p.created_at DESC LIMIT 1;
-- external_receipt_no='TX-TEST-001', booth_count=2
```

### 2-9. 케이스 C — 현금 + 식권 (잔액 발생)

1. 사전: 액면 8,000원 식권 1장 발급 (Admin 쿠폰 페이지)
2. 손님 휴대폰 입력 → 식권 라디오 선택
3. 카트 5,000원 메뉴 1개 (식권 8,000원으로 결제 시 3,000원 잔액 소멸)
4. 결제 방식 자동/현금 (어차피 0원 결제)
5. `[결제 완료]`
   - [ ] 자동 `voucher_only` 분기 (도우미 입력값 무시)

**검증 SQL:**
```sql
SELECT id, payment_method, total_amount, coupon_id, refunded_amount
FROM payments
WHERE assisted_by = 'admin01'
ORDER BY created_at DESC LIMIT 1;
-- payment_method='voucher_only', total_amount=0, coupon_id NOT NULL

SELECT booth_name, voucher_consumed, voucher_burned
FROM orders
WHERE payment_id = '<위id>';
-- voucher_consumed=5000 / voucher_burned=3000 (분배 정합)

SELECT status, used_at FROM coupons WHERE id = '<coupon_id>';
-- status='used'
```

### 2-10. 케이스 D — 외부카드 + 할인쿠폰

1. 사전: 손님 휴대폰으로 2,000원 할인쿠폰 발급 (최소 주문액 5,000원)
2. 카트 7,000원 → 휴대폰 입력 → 할인쿠폰 선택 (예상 결제 5,000원)
3. 외부 카드 + 영수증번호 입력 → 결제

**검증 SQL:**
```sql
SELECT payment_method, discount_amount, total_amount, coupon_id
FROM payments
WHERE assisted_by = 'admin01'
ORDER BY created_at DESC LIMIT 1;
-- discount_amount=2000, total_amount=5000, payment_method='external_card'
```

### 2-11. 케이스 E — 주류 메뉴 결제

1. 카트에 주류 메뉴 1개
2. 주류 inline 체크박스 ON
3. 현금 결제 진행

**검증 SQL:**
```sql
SELECT o.id, o.alcohol_consent_at, p.payment_method
FROM orders o JOIN payments p ON p.id = o.payment_id
WHERE p.assisted_by = 'admin01'
ORDER BY o.created_at DESC LIMIT 3;
-- alcohol_consent_at NOT NULL (체크 통과 시점)
```

### 2-12. 부스앱 즉시 도착 회귀

1. 위 결제건의 매장 부스앱 화면 확인
   - [ ] 결제 직후 새 주문 카드 등장 (Realtime — pending → paid 전이)
   - [ ] 카드 메뉴/수량/매장명/포장여부 정확
   - [ ] 주류 케이스(2-11)는 빨간 배너 노출

---

## 3. 오늘 내역 탭 (Tab 2)

### 3-1. method 별 합계 + 본인 처리분만

1. `admin01` 으로 위 케이스 A~E 결제 후 `오늘 내역` 탭 진입
   - [ ] 상단 합계: `오늘 처리 합계 N건 · X원` (`본인 처리분 (admin01)`)
   - [ ] method 별 합계 (현금/외부카드/식권만 분리 노출)
2. 처리 내역 카드 (시간 역순)
   - [ ] 각 카드: HH:MM + method 배지(색상 구분) + 금액
   - [ ] 메뉴 요약 (메뉴×수량 콤마)
   - [ ] 외부카드 케이스: `영수증 TX-TEST-001` 표시
3. `[새로고침]` 버튼 → 최신 동기화

### 3-2. 다른 도우미 처리분 노출 X

1. `musanfesta` super 로 별도 결제 처리 (가능하면 — super 도 헬프데스크 탭 사용 가능)
   - 비고: super 도 헬프데스크에서 결제하면 `assisted_by='musanfesta'`
2. `admin01` 의 오늘 내역 탭에서 해당 결제 노출 안 됨
   - [ ] super 처리분이 admin01 화면에 안 보여야 함

### 3-3. 부분 환불 케이스

1. (§5 환불 진행 후) `오늘 내역` 으로 복귀
   - [ ] 부분환불된 건 카드 하단 `부분환불 N원` 노출
   - [ ] 전액 취소된 건 `취소됨` 빨간 배지 + 카드 흐려짐(opacity)

---

## 4. 시재 관리 탭 (Tab 3)

### 4-1. 세션 미시작

1. (오늘 첫 진입) 시재 관리 탭
   - [ ] `오늘 시재 세션` + `아직 시작되지 않았습니다`
   - [ ] 시작 시재 입력 + `[세션 시작]`
2. `50000` 입력 → `[세션 시작]`
   - [ ] 세션 진행 중 화면으로 전환

**검증 SQL:**
```sql
SELECT session_date, starting_amount, started_by, started_at, ended_at
FROM cash_sessions
ORDER BY session_date DESC LIMIT 1;
-- starting_amount=50000, started_by='admin01', ended_at IS NULL
```

### 4-2. 진행 중 — 실시간 합계

1. 시재 진행 중 화면
   - [ ] 시작 시재 50,000원
   - [ ] 현금 결제 누적 (위 케이스 A 6,000원 등 합산)
   - [ ] 현금 환불 누적 (해당 시 차감)
   - [ ] 예상 시재 = 시작 + 현금IN − 현금OUT
2. `[새로고침]` → 최신 합계 동기화
3. 추가 현금 결제 (주문 입력 탭) 후 새로고침
   - [ ] 현금 결제 누적 자동 증가

### 4-3. 마감 입력 + 차액 표시

1. `[세션 마감]` → 마감 모드 진입
2. 실제 보유 현금 입력 (예: 예상 시재 + 1,000)
   - [ ] 차액 자동 표시: `+1,000원 (초과)` (주황)
3. 일치하는 금액 입력
   - [ ] `일치` (녹색)
4. 부족 케이스 (-500)
   - [ ] `-500원 (부족)` (빨강)
5. 메모 자유 입력 → `[마감 확정]`

**검증 SQL:**
```sql
SELECT session_date, starting_amount, expected_amount, ending_amount, difference, notes, ended_by, ended_at
FROM cash_sessions
WHERE session_date = CURRENT_DATE;
-- 마감 시각/마감자/차액/메모 정상 기록
```

### 4-4. 마감된 세션

1. 마감 후 시재 탭 재진입
   - [ ] `마감됨` 배지 + 시작/예상/실제/차액/메모/마감시각/마감자 표시
   - [ ] `[세션 마감]` 버튼 노출 X (재마감 차단)

### 4-5. 다음 날 새 세션

- 검증 비고: 익일에 진입 시 `미시작` 상태로 다시 시작 가능 (session_date UNIQUE 로 보장)
- 빠른 검증: SQL 로 `session_date` 를 어제로 update 후 페이지 재진입

```sql
-- 빠른 시뮬레이션 (필요시)
UPDATE cash_sessions
SET session_date = CURRENT_DATE - INTERVAL '1 day'
WHERE session_date = CURRENT_DATE;
-- 새로고침 후 세션 미시작 화면 보여야 함
```

---

## 5. 환불 method 별 분기

> `musanfesta` 로 로그인 후 `/admin/orders` 에서 검증 (helper 는 환불 권한 X 영역)

### 5-1. PG 결제 환불 — 기존 동작 유지

1. 손님 PWA 에서 정상 결제 1건 (PG)
2. 어드민 주문 관리 → 결제 카드 클릭 → 상세 모달
3. `[매장별 환불]` 섹션
   - [ ] method 안내 박스 X (PG 는 안내 없음)
   - [ ] 주류 hint 는 주류 주문일 때만
4. 환불 사유 입력 → `[환불]`
   - [ ] Toss API 호출 → DB cancelled 반영

### 5-2. 외부 카드 환불 — DB만, 안내 박스

1. 위 §2-8 외부카드 결제 클릭 → 상세 모달
   - [ ] 파란 안내 박스 `⚠ 외부 카드 단말기 결제 (영수증 TX-TEST-001)` + `단말기에서 별도로 환불 처리해주세요. 시스템은 정산 데이터에서만 제외됩니다.`
2. 사유 입력 → `[환불]`
   - [ ] Toss API 호출 X
   - [ ] DB orders/payments → cancelled 정상 반영
   - [ ] 토스 콘솔 로그에 cancel 호출 X 확인 (운영자 확인용)

**검증 SQL:**
```sql
SELECT id, payment_method, status, refunded_amount
FROM payments
WHERE id = '<external_card payment id>';
-- payment_method='external_card', status='cancelled' (전액) 또는 refunded_amount > 0 (부분)
```

### 5-3. 현금 환불 — DB만 + 시재 자동 반영

1. 위 §2-7 현금 결제 클릭 → 상세 모달
   - [ ] 녹색 안내 박스 `⚠ 현금 결제` + `손님에게 현금으로 직접 반환해주세요. 시재 관리 페이지에 자동 반영됩니다.`
2. `[환불]` 진행
3. 시재 관리 탭 재진입
   - [ ] `현금 환불 누적` 에 환불액 반영
   - [ ] 예상 시재 자동 차감

### 5-4. 식권 100% 환불 — 식권 복구 X 안내

1. 위 §2-9 voucher_only 결제 클릭 → 상세 모달
   - [ ] 보라 안내 박스 `⚠ 식권 100% 결제` + `환불 처리해도 식권은 복구되지 않습니다.`
2. 환불 진행
   - [ ] DB orders/payments cancelled
   - [ ] coupons.status = 'used' 유지 (복구 X)

**검증 SQL:**
```sql
SELECT c.id, c.status, c.used_at, p.status AS payment_status
FROM coupons c JOIN payments p ON p.id = c.used_payment_id
WHERE p.payment_method = 'voucher_only' AND p.status = 'cancelled'
ORDER BY p.cancelled_at DESC LIMIT 1;
-- coupons.status = 'used' (환불해도 그대로)
```

---

## 6. 통계 / 정산 회귀

### 6-1. StatsRevenueTab — method 분리 노출 (선택 검증 — 본 페이즈 외)

> 본 v1 에선 **운영진 통계에 method 별 분리표는 미반영**. 후속 페이즈에서 처리.

- [ ] 현재는 매출/쿠폰/주문 통계가 method 무관하게 합산 (정상)

### 6-2. AdminSettlement — method 비공개 회귀

1. `musanfesta` 로 정산 관리 진입
   - [ ] 매장별 매출 합계만 표시
   - [ ] payment_method 컬럼/분리 표 X (매장에 method 노출되지 않아야 함)

---

## 7. 종합 DB 정합성

```sql
-- (a) method 별 분포
SELECT payment_method, COUNT(*) AS cnt, SUM(total_amount) AS total
FROM payments WHERE status = 'paid'
GROUP BY payment_method ORDER BY cnt DESC;

-- (b) 도우미별 처리량
SELECT assisted_by, COUNT(*) AS handled, SUM(total_amount) AS total_paid
FROM payments
WHERE assisted_by IS NOT NULL
GROUP BY assisted_by;

-- (c) 시재 정합성
SELECT session_date, starting_amount, expected_amount, ending_amount, difference, notes, started_by, ended_by
FROM cash_sessions ORDER BY session_date DESC;

-- (d) external_receipt_no 누락 케이스 (있으면 안 됨)
SELECT id, payment_method, external_receipt_no
FROM payments
WHERE payment_method = 'external_card' AND external_receipt_no IS NULL;
-- 빈 결과 = OK

-- (e) helper 가 super 만 가능한 영역 접근 시도 흔적 (audit 없으므로 N/A)

-- (f) cash 결제 환불 → 시재 cashOut 정합
SELECT
  SUM(total_amount) FILTER (WHERE status='paid') AS cash_in,
  SUM(refunded_amount) FILTER (WHERE status IN ('paid','cancelled')) AS cash_out
FROM payments
WHERE payment_method = 'cash'
  AND created_at >= CURRENT_DATE
  AND created_at < CURRENT_DATE + INTERVAL '1 day';
-- 시재 화면의 현금IN/현금OUT 과 일치해야 함
```

---

## 통과 기준

- §1 다중 계정 + helper redirect ✅
- §2 주문 입력 5개 케이스(A~E) + 부스앱 즉시 도착 ✅
- §3 오늘 내역 method 별 + 본인 처리분만 ✅
- §4 시재 시작/진행/마감/차액/마감재차단 ✅
- §5 환불 method 분기 4종 + Toss 호출 X 확인 ✅
- §6 정산 화면 method 비공개 ✅
- §7 SQL 정합성 (a)~(f) 통과 ✅

전 항목 통과 시 결제 도우미 v1 정상 동작.

---

## 알려진 한계 / 후속 작업 (별도 페이즈)

- 운영진 통계 method 별 분리 표 (StatsRevenueTab)
- 매뉴얼 §6-2 워딩 수정 ("토스페이먼츠 수수료" → "결제 시스템 수수료")
- 도우미간 처리분 공유 보기 (현재 본인 것만)
- 시재 시작 시재 자동 기본값 (전날 마감 시재 → 오늘 시작 제안)
- 주류 결제 인증 강화 (현재 inline 체크박스 자기보고)
- 도우미 활동 audit 로그
