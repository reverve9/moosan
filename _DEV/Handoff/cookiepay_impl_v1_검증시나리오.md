# 쿠키페이먼츠(키움페이) 통합 — 검증 시나리오 v1

토스페이먼츠 → 쿠키페이먼츠 PG 교체. Phase 1~6 통합 후 dev 환경에서 전구간 검증.

**대상 dev URL**: `https://dev.musanfesta.com`
**전제 브랜치**: `dev` (commits `c8dde23` ~ Phase 6 commit)

---

## §0 사전 준비 — 사용자 직접 액션

### 0-1. 환경변수 (Vercel + 로컬)

Vercel `dev.musanfesta.com` Project Settings → Environment Variables (Preview/Development 환경):

```
VITE_COOKIEPAY_API_ID=<쿠키페이 발급>
COOKIEPAY_API_KEY=<쿠키페이 발급>
COOKIEPAY_PAY2_ID=<환불용, 쿠키페이 발급>
COOKIEPAY_PAY2_KEY=<환불용, 쿠키페이 발급>
COOKIEPAY_SANDBOX=true
```

`.env.local` 에도 동일 등록 (개발 시 `vercel dev` 사용 시 필요).

⚠ `COOKIEPAY_*` 는 server-only — **절대 `VITE_` prefix 금지** (`VITE_COOKIEPAY_API_ID` 제외, 이건 공개값).

### 0-2. DB 마이그 적용

Supabase Dev project SQL Editor 에 `_DEV/Seeds/39_cookiepay_columns.sql` 실행.

확인:
```sql
SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
  WHERE table_name='payments'
    AND column_name IN ('pg_provider','pg_method','pg_tid','pg_accept_no');
-- 4 rows, 전부 nullable=YES, data_type=text
```

### 0-3. 쿠키페이 콘솔 — Noti URL 등록

쿠키페이 콘솔 → API 연동 메뉴 → PG사 조회 및 연동 설정 → PG 연동 → **통지전문(Noti) 입력란**:

```
https://dev.musanfesta.com/api/cookiepay/noti
```

설정 저장 후 §10 에서 동작 검증.

### 0-4. 카카오페이/네이버페이 활성화 여부 확인

쿠키페이 콘솔에서 KAKAOPAY/NAVERPAY 가맹점 등록 완료 + 가맹점 노출 활성 확인. (키움페이 가맹점만 지원)

미등록 상태이면 결제창에서 해당 결제수단 선택 시 PG 에러 발생 — 운영본부 확인 필요.

---

## §1 결제 전 상태 점검 — 빌드 / health

### §1-1. 빌드 확인

```bash
npm run build
# tsc -b + vite build 모두 0 errors
```

### §1-2. /api/cookiepay/return health (잘못된 접근)

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://dev.musanfesta.com/api/cookiepay/return
# 302 (GET 접근 → /payment/cancel?reason=invalid_access 로 redirect)
```

### §1-3. /api/cookiepay/noti health

```bash
curl -s -X POST https://dev.musanfesta.com/api/cookiepay/noti \
  -H "Content-Type: application/json" -d '{}'
# 200 {"ok":true,"skipped":"approval_noti"}
#   (noti_type 미지정 → 승인 통지로 분류, skip)
```

---

## §2 happy path — CARD 결제

손님 시나리오 (PWA — dev.musanfesta.com).

1. `/cart` 에서 메뉴 담기 (1개 부스, 1개 메뉴 정도로 단순하게)
2. `/checkout` 진입 → 휴대폰 입력
3. **결제수단 섹션** 노출 확인 — 카드 / 카카오페이 / 네이버페이 3개
4. 카드 선택 (기본)
5. **[결제하기]** 클릭
6. 쿠키페이 결제창 도착 — 샌드박스 테스트 카드 입력
7. 결제 완료 → 자동으로 `/order/:paymentId?from=checkout` 로 이동
8. 주문 상태 페이지에서 부스 카드 정상 표시

DB 검증:
```sql
SELECT id, status, payment_key, pg_provider, pg_method, pg_tid, pg_accept_no, total_amount, paid_at
  FROM payments WHERE phone='<입력한번호>' ORDER BY created_at DESC LIMIT 1;
-- status=paid, pg_provider='cookiepay', pg_method='card', pg_tid != null, pg_accept_no != null

SELECT status, paid_at FROM orders WHERE payment_id='<위 id>';
-- 모두 status=paid, paid_at != null
```

브라우저 검증:
- 헤더 back 버튼 숨김 ( `/order/...?from=checkout` 마킹 동작)
- 새로고침 후에도 차단 유지

---

## §3 happy path — KAKAOPAY 결제 ⏸ **라이브 전환 후**

> ⚠ 샌드박스 환경에서는 KAKAOPAY/NAVERPAY 결제 자체가 동작하지 않음
> (카카오/네이버 측 샌드박스 미제공). 본 항목은 **라이브 전환 후** 진행.

§2 와 동일 흐름. 결제수단 선택만 다름.

1. `/checkout` → 결제수단 = **카카오페이** 선택
2. UI 에 "환불은 행사 운영본부 문의 (자동 환불 미지원)" 안내 표시 확인
3. 결제하기 → 카카오페이 결제창
4. 결제 완료 → `/order/:id` 도착

DB 검증:
```sql
SELECT pg_method FROM payments WHERE id='<위>';
-- 'kakaopay'
```

⚠ 키움페이 가맹점 활성화 안 됐으면 결제창에서 에러 — §0-4 점검.

---

## §4 happy path — NAVERPAY 결제 ⏸ **라이브 전환 후**

§3 와 동일 사유. **라이브 전환 후** 진행. 결제수단 = **네이버페이** 선택.

DB 검증: `pg_method='naverpay'`.

---

## §5 식권 100% 결제 (PG 우회)

1. `/admin/coupons` 어드민 → 식권 발급 (10,000원)
2. 손님: `/cart` 에 10,000원 이하 메뉴 담기
3. `/checkout` 진입 → 휴대폰 입력 → 식권 선택 (자동 표시)
4. `calc.finalAmount === 0` 이면 **결제수단 섹션 노출 X** 확인
5. **[결제하기]** 클릭 — 쿠키페이 결제창 우회, 바로 `/order/:id` 도착

DB 검증:
```sql
SELECT payment_method, status, pg_provider, total_amount
  FROM payments WHERE id='<위>';
-- payment_method='voucher_only', status='paid', pg_provider=null, total_amount=0
```

---

## §6 결제 취소 (결제창 내 사용자 취소)

1. `/checkout` → 결제수단 = 카드 → 결제하기
2. 쿠키페이 결제창에서 **취소** 버튼 또는 닫기 (CANCELURL 발화)
3. `/payment/cancel` 도착 확인
4. 페이지 메시지 "결제를 취소했어요" + "장바구니로 돌아가기" 버튼

DB 검증:
```sql
SELECT status FROM payments WHERE phone='<번호>' ORDER BY created_at DESC LIMIT 1;
-- status='pending' (paid 안 됨 — 정상)
```

⚠ pending 잔류 행은 운영상 무방. 24h 후 cleanup 정책은 별도 (현재 자동 정리 없음).

---

## §7 환불 — 카드 (부스 거절)

§2 의 paid 행에 대해 부스앱에서 거절.

1. 부스 대시보드 (`booth.musanfesta.com`) 로그인
2. §2 에서 결제한 주문 카드 찾기 → **거절** 버튼 → 사유 입력
3. 환불 처리 진행 (2~5초)

검증:
```sql
SELECT status, refunded_amount, pg_method FROM payments WHERE id='<위>';
-- status='cancelled' (단일 부스), refunded_amount=total_amount

SELECT status, cancelled_at, cancelled_by FROM orders WHERE id='<orderId>';
-- status='cancelled', cancelled_by='booth'
```

알림톡 도착 (refund template) 확인.

쿠키페이 콘솔 → 거래내역 → 환불 건 확인 (cancel_tid, cancel_amt).

---

## §8 환불 — 카드 (어드민 풀환불)

§2 happy path 한 건 더 만들고 — 부스 거절 전에 어드민 풀환불.

1. `admin.musanfesta.com` → 결제/주문 관리
2. 해당 결제 행 → **환불** 버튼 → 사유 입력
3. 처리 진행

검증:
```sql
SELECT status, refunded_amount, meta->>'cancelled_via' FROM payments WHERE id='<위>';
-- status='cancelled', refunded_amount=total_amount, cancelled_via='admin'
```

---

## §9 환불 — KAKAOPAY (수동 처리 알람) ⏸ **라이브 전환 후**

§3 와 동일 사유 (샌드박스에서 KAKAOPAY 결제 자체 불가). §3 paid 행 확보 후 진행.

1. 부스 거절 처리
2. 응답: `manualRefundRequired: true`
3. Vercel function 로그 확인:
   ```
   [orders/cancel] manual refund required {...pgMethod:"kakaopay",pgTid:"...",reason:"..."}
   ```
4. DB:
   ```sql
   SELECT status, cancelled_by, meta FROM orders WHERE id='<위>';
   -- status='cancelled', meta->>'manual_refund_required'='true', meta->>'manual_refund_method'='kakaopay'
   ```

운영진 액션:
- 쿠키페이/키움페이 콘솔에서 해당 거래(`pg_tid`) 수동 환불
- 또는 카카오페이 가맹점 콘솔에서 직접 환불

알림톡은 시스템이 자동 발송 (refund 템플릿) — 손님은 환불 처리 안내 받음.

---

## §10 Noti — 외부 취소 통지 ⏸ **라이브 전환 후**

§3/§4 paid 행 확보 후 진행. 샌드박스에서는 카드 결제 후 쿠키페이 콘솔에서 수동 환불 시도로도 noti 발화 시뮬 가능 (콘솔 측 지원 여부 확인 필요).

§3 또는 §4 의 paid 행에 대해 **카카오페이 앱** 또는 **네이버페이 앱**에서 손님이 직접 결제 취소.

(쿠키페이/키움페이 콘솔에서도 수동 환불 시 동일 noti 발화 — §9 의 수동 환불 후 자동 후속 처리 가능)

1. 카카오페이 앱 → 결제내역 → 해당 거래 취소
2. 쿠키페이 서버가 우리 `/api/cookiepay/noti` 로 POST 발화 (몇 분 내)
3. Vercel function 로그:
   ```
   [cookiepay/noti] received {"paymethod":"KAKAOPAY","noti_type":"cancel","orderno":"...","cancel_amount":"...","tid":"...","cancel_date":"..."}
   ```
4. DB:
   ```sql
   SELECT status, refunded_amount, meta->>'cancelled_via' FROM payments WHERE pg_tid='<해당>';
   -- status='cancelled', refunded_amount=total_amount, cancelled_via='cookiepay_noti'
   ```
5. 살아있던 orders 전부 cancelled, 쿠폰 복원, 환불 알림톡 발송

⚠ 부분 취소 noti 가 오면 `payments.refunded_amount` 만 누적 + 콘솔 알람 (orders/coupons 는 운영진 수동 판단).

---

## §11 멀티부스 + 쿠폰 + 카드 환불 (회귀)

세션 34 의 환불 비례 분배 로직 회귀 검증.

1. 쿠폰 1만원 발급 + 휴대폰 자동조회
2. A 부스 1만원 + B 부스 1천원 + C 부스 1천원 — 총 12,000원 → 쿠폰 적용 → 2,000원 결제 (카드)
3. A 부스 거절
4. DB:
   ```sql
   SELECT id, status, subtotal FROM orders WHERE payment_id='<위>' ORDER BY booth_no;
   -- A: cancelled, B/C: paid
   SELECT refunded_amount FROM payments WHERE id='<위>';
   -- floor(10000 × 2000 / 12000) = 1666 (비례 분배)
   ```
5. B 부스 거절 → +166 → 누적 1832
6. C 부스 거절 → 마지막 부스 → 잔액 흡수 → +168 → 총 2000
7. `payments.status='cancelled'`, 쿠폰 status='active' 복원 확인

---

## §12 운영 액션 — 라이브 전환 절차

행사 직전 라이브 PG 로 전환 시:

1. 쿠키페이 콘솔에서 **라이브** 가맹점 발급 (별도 API_ID/KEY/PAY2_ID/PAY2_KEY)
2. Vercel `musanfesta.com` (prod) Project Settings 에 새 키 등록 + `COOKIEPAY_SANDBOX=false`
3. **`index.html` 스크립트 URL 교체** — `sandbox.cookiepayments.com` → `www.cookiepayments.com` (주석으로 명시된 두 줄)
4. 쿠키페이 콘솔 **라이브 환경** Noti URL 등록: `https://musanfesta.com/api/cookiepay/noti`
5. dev 머지 → main → prod 배포
6. prod DB 에 `_DEV/Seeds/39_cookiepay_columns.sql` 적용
7. 실 결제 1건 테스트 후 정상 확인

---

## §13 known issues / 정리 사항

### legacy 토스 환불 분기 유지
`api/orders/cancel.ts` + `api/payments/cancel.ts` 에 토스 분기 코드 잔류. 행사 종료 후 별도 세션에서:
- `TOSS_SECRET_KEY` env 제거
- 토스 분기 코드 블록 삭제
- DB legacy 행 (`pg_provider IS NULL AND payment_key LIKE 'live_%'`) 정리

### 부분 취소 Noti 수동 처리
`api/cookiepay/noti.ts` 가 부분 취소를 받으면 `payments.refunded_amount` 만 누적 + `console.error` 알람. orders 는 운영진 판단. 자주 발생하면 Sentry 등 알람 시스템 연동 검토.

### TOKEN 캐시 격리
`api/_lib/cookiepay.ts` 의 `_tokenCache` 는 Vercel function instance 별 격리. 환불 빈도가 높으면 캐시 적중률 낮음 — 행사 동안엔 무방하나, 장기적으로 KV/Upstash 등 외부 캐시 검토 가능.

### 카카오/네이버페이 환불 가능 여부 (재확인 필요)
매뉴얼은 "신용카드/계좌이체만 취소 가능" 명시 — Noti 의 `paymethod: KAKAOPAY/NAVERPAY` 는 외부 취소를 의미할 가능성. 영업담당 확인 후, 만약 자동 환불 가능하다면 `api/_lib/cookiepay.ts#isPgMethodAutoRefundable` 에 추가.
