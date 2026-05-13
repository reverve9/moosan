# 솔라피 알림톡 v1 — 검증 시나리오

> 커밋: `fc4b88d` (dev, module resolution fix 포함)
> 관련 doc: `solapi_impl_v1.md`, `solapi_impl_v1_구현보고.md`, `solapi_fix_v1_module_resolution.md`

**진행 원칙**: §0 → §6 순서대로 진행. **각 단계에서 막히면 더 진행하지 말고 그 결과를 챗에 보고**. 한 단계가 통과해야 다음이 의미 있음.

---

## §0 사전 준비 (체크박스만 — 명령 실행 X)

- [ ] **(A) Vercel 배포** — `dev` 브랜치 `fc4b88d` 가 `musanfesta-dev` 에 반영됐는지 Vercel Dashboard → Deployments 에서 확인. **"Ready" 상태 + 커밋 해시 `fc4b88d` 일치**
- [ ] **(B) Vercel ENV** — Project Settings → Environment Variables. 다음 6개가 `Production`+`Preview` 모두 등록되어 있는지 (값 자체는 비어있어도 OK — 비어있으면 자동 skip):
  - `SOLAPI_API_KEY` / `SOLAPI_API_SECRET`
  - `KAKAO_SENDER` / `KAKAO_PFID`
  - `KAKAO_TEMPLATE_PICKUP` / `KAKAO_TEMPLATE_REFUND`
  - ⚠️ **`VITE_` prefix 절대 X**
- [ ] **(C) `.env.local`** (로컬 dev 서버에서 테스트할 경우만) — 6개 값 입력
- [ ] **(D) 마이그레이션 적용 여부** — 다음 §1 에서 확인. **이게 안 되면 모든 발송이 500 으로 실패**

---

## §1 DB — 마이그레이션 적용 확인

**위치**: Supabase Dashboard → SQL Editor

### 1-1. 테이블 존재 확인

```sql
SELECT relname, relrowsecurity
FROM pg_class
WHERE relname = 'alimtalk_logs';
```

- [ ] **기대**: 1행 반환, `relrowsecurity = true`
- [ ] **0행이면**: 마이그레이션 미적용. `_DEV/Seeds/38_alimtalk_logs.sql` 전체 내용을 SQL Editor 에 붙여넣어 실행 후 재확인

### 1-2. UNIQUE 제약 확인

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'alimtalk_logs'
ORDER BY indexname;
```

- [ ] **기대**: 5개 인덱스 (PK 1 + UNIQUE idempotency_key 1 + 일반 3)
- [ ] **`alimtalk_logs_idempotency_key_key` UNIQUE 인덱스 존재 확인**

### 1-3. RLS 정책 + GRANT

```sql
SELECT polname, polcmd FROM pg_policy WHERE polrelid = 'alimtalk_logs'::regclass;
SELECT grantee, privilege_type FROM information_schema.role_table_grants
  WHERE table_name='alimtalk_logs' AND grantee IN ('anon','authenticated');
```

- [ ] `alimtalk_logs_all` 정책 1행 + `anon`/`authenticated` 각각 SELECT/INSERT/UPDATE 3개씩 grant 확인

**§1 통과 못 하면** → 챗 보고. 이후 §2~§6 모두 의미 없음.

---

## §2 테스트 데이터 픽업 (DB query)

**다음 SQL 로 테스트용 orderId + boothId 1쌍 추출**:

```sql
-- 픽업/환불 테스트에 쓸 paid/confirmed 상태 주문 1건 + 같은 booth 다른 주문 1건
SELECT
  o.id AS order_id,
  o.booth_id,
  o.booth_name,
  o.phone,
  o.order_number,
  o.status,
  o.ready_at,
  o.subtotal
FROM orders o
WHERE o.status IN ('paid','confirmed')
  AND o.ready_at IS NULL
  AND o.picked_up_at IS NULL
ORDER BY o.created_at DESC
LIMIT 5;
```

- [ ] 결과에서 **테스트용 1행 선택** → `order_id`, `booth_id`, `booth_name`, `phone` **메모**
- [ ] **권장**: `phone` 이 본인 번호인 행. 본인 번호로 등록된 주문이 없으면 임의 행 선택 (알림톡은 실제 발송 안 되어도 로직 검증 가능)
- [ ] 0행이면 → 부스앱/손님 PWA 에서 새 주문 1건 결제 후 재실행

**아래 단계에서 사용할 변수 정의** (예시 — 본인 값으로 치환):
```
ORDER_ID=11111111-2222-3333-4444-555555555555
BOOTH_ID=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee
BAD_BOOTH_ID=99999999-9999-9999-9999-999999999999   # 위 booth_id 와 다른 임의 UUID
BASE=https://musanfesta-dev.vercel.app
```

---

## §3 Health check — module resolution 확인 (가장 먼저)

**목적**: 직전 fix (`.js` 확장자) 가 Vercel 런타임에 반영됐는지 확인. 비즈 로직 진입 전 단계.

### 3-1. body 없이 호출 → 400 기대 (ERR_MODULE_NOT_FOUND 아님)

```bash
curl -i -X POST "$BASE/api/booth-orders/ready" \
  -H 'Content-Type: application/json' \
  -d '{}'
```

- [ ] **기대**: `HTTP/2 400` + `{"error":"orderId, boothId are required"}`
- [ ] **이게 500 이면**:
  - 응답 본문에 `ERR_MODULE_NOT_FOUND` 있음 → fix 가 아직 배포 안 됨. Vercel Deployments 에서 `fc4b88d` Ready 인지 재확인.
  - `ERR_MODULE_NOT_FOUND` 가 다른 모듈 (`solapi`, `@supabase/supabase-js`) → 챗 보고
  - 다른 500 메시지 → 응답 전문 챗 보고

**§3-1 통과해야 §4 이후 의미 있음.**

---

## §4 happy path — ready 처리 + 알림톡 시도

### 4-1. 정상 호출

```bash
curl -i -X POST "$BASE/api/booth-orders/ready" \
  -H 'Content-Type: application/json' \
  -d "{\"orderId\":\"$ORDER_ID\",\"boothId\":\"$BOOTH_ID\"}"
```

- [ ] **기대**: `HTTP/2 200` + `{"ok":true}`
- [ ] 응답이 다른 코드면 §6-A 트러블슈팅 참고

### 4-2. DB 변경 확인 (Supabase SQL Editor)

```sql
SELECT id, status, ready_at, confirmed_at, picked_up_at
FROM orders
WHERE id = '여기에 ORDER_ID 붙여넣기';
```

- [ ] `ready_at` IS NOT NULL (방금 시각)
- [ ] `confirmed_at` IS NOT NULL (이미 있었거나 동시에 채워짐)
- [ ] `status = 'confirmed'`

### 4-3. alimtalk_logs 행 확인

```sql
SELECT id, order_id, booth_id, phone, template_type, status,
       solapi_message_id, error_code, error_message,
       created_at, sent_at
FROM alimtalk_logs
WHERE order_id = '여기에 ORDER_ID 붙여넣기'
ORDER BY created_at DESC;
```

- [ ] 1행 존재. `template_type = 'pickup'`
- [ ] `status` 가 다음 중 하나:
  - **`'sent'`** → 알림톡 성공. `solapi_message_id` 채워짐. 본인 번호면 카톡 수신 확인
  - **`'skipped_no_template'`** → `KAKAO_TEMPLATE_PICKUP` env 미설정. §0-B 확인
  - **`'skipped_no_phone'`** → 주문 phone NULL. 다른 order_id 로 재시도
  - **`'failed_invalid_phone'`** → phone 11자리 010 형식 아님 (legacy 데이터). 다른 order_id 로 재시도
  - **`'fallback_lms'`** → 알림톡 실패 → SMS/LMS 자동 전환 발송됨. 정상 (다만 비용 더 들음 — 솔라피 콘솔 발송 내역 확인)
  - **`'failed'`** → 솔라피 호출 자체 실패. `error_code` + `error_message` 챗 보고
  - **`'pending'`** → INSERT 후 UPDATE 안 들어옴. 함수 도중 죽음. Vercel 함수 로그 확인
- [ ] 본인 번호 + `status='sent'` 인데 카톡 미수신 → 솔라피 콘솔 → 메시지 내역 에서 실 발송 여부 / 차단 / 노티스 OFF 여부 확인

---

## §5 edge cases

### 5-1. booth/order 정합성 (403)

```bash
curl -i -X POST "$BASE/api/booth-orders/ready" \
  -H 'Content-Type: application/json' \
  -d "{\"orderId\":\"$ORDER_ID\",\"boothId\":\"$BAD_BOOTH_ID\"}"
```

- [ ] **기대**: `HTTP/2 403` + `{"error":"booth/order mismatch"}`

### 5-2. 존재 안 하는 order (404)

```bash
curl -i -X POST "$BASE/api/booth-orders/ready" \
  -H 'Content-Type: application/json' \
  -d "{\"orderId\":\"00000000-0000-0000-0000-000000000000\",\"boothId\":\"$BOOTH_ID\"}"
```

- [ ] **기대**: `HTTP/2 404` + `{"error":"order not found"}`

### 5-3. 멱등성 — 같은 주문 ready 재호출

§4-1 과 **동일한 curl** 한 번 더:

```bash
curl -i -X POST "$BASE/api/booth-orders/ready" \
  -H 'Content-Type: application/json' \
  -d "{\"orderId\":\"$ORDER_ID\",\"boothId\":\"$BOOTH_ID\"}"
```

- [ ] **기대**: `HTTP/2 200` `{"ok":true}` (멱등)
- [ ] alimtalk_logs 재확인 — **새 row 추가 안 됨, 기존 1행만 유지** (`idempotency_key` UNIQUE 가 차단):

```sql
SELECT COUNT(*) FROM alimtalk_logs
WHERE order_id = '여기에 ORDER_ID' AND template_type = 'pickup';
```

- [ ] **기대**: `count = 1`

---

## §6 환불 흐름 (선택 — refund 템플릿 검수중이면 §6 skip 가능)

§4 에서 `ready_at` 이 채워진 주문은 **환불 불가능**. 새 주문으로 진행하거나 어드민 force-refund 사용.

### 6-1. 부스 거절 (단건 환불) — 어드민 UI 또는 curl

새 paid/confirmed 주문 1건 픽업 (§2 의 SQL 재실행해서 `ready_at IS NULL` 인 행 1개 선택. 변수 `REFUND_ORDER_ID` 로 명명).

```bash
curl -i -X POST "$BASE/api/orders/cancel" \
  -H 'Content-Type: application/json' \
  -d "{\"orderId\":\"$REFUND_ORDER_ID\",\"reason\":\"테스트 환불\",\"cancelledBy\":\"booth\"}"
```

- [ ] **기대**: `HTTP/2 200` + `{"ok":true,...refundAmount:N...}`
- [ ] alimtalk_logs 새 row — `template_type='refund'`, status 는 §4-3 의 동일 케이스 분기:
  - `'skipped_no_template'` ← 환불 템플릿 env 비어있음 (검수중 정상 동작)
  - `'sent'` / `'fallback_lms'` ← 환불 템플릿 env 채워졌고 발송 성공

```sql
SELECT status, error_message, request_payload
FROM alimtalk_logs
WHERE order_id = '여기에 REFUND_ORDER_ID' AND template_type='refund';
```

---

## §7 트러블슈팅 룩업

### A. §4-1 에서 500 발생

1. **Vercel 함수 로그** (Vercel Dashboard → 해당 Deployment → Functions → `/api/booth-orders/ready` → Logs) 마지막 에러 확인
2. 에러별 대응:
   - `ERR_MODULE_NOT_FOUND` → fix 미반영. §3-1 재확인.
   - `relation "alimtalk_logs" does not exist` → §1 마이그레이션 미적용
   - `Missing SUPABASE_URL` 류 → ENV 미설정 (§0-B)
   - `null value in column "phone"` 류 → orders.phone 데이터 이상
   - 그 외 → 응답 본문 전체 + 함수 로그 챗 보고

### B. 200 인데 알림톡 안 옴

- `alimtalk_logs.status = 'sent'` → 솔라피 콘솔 → 메시지 내역 / 발송 통계 확인. 발송 성공인데 미수신이면 수신자 카톡 차단 / 비활성 / 비즈 친구 미추가 가능성
- `status = 'skipped_no_template'` → ENV `KAKAO_TEMPLATE_PICKUP` 미설정 (§0-B). 검수 통과 본인 ID 확인
- `status = 'pending'` 30초 이상 유지 → Solapi 호출 도중 함수 타임아웃 또는 크래시. Vercel 함수 로그 확인

### C. 어떤 단계에서 막혔는지 챗 보고 양식

```
§: (예: §4-3)
실행: (curl 그대로 또는 SQL)
응답/결과: (응답 본문 또는 SQL 결과)
alimtalk_logs.status: (있다면)
Vercel 함수 로그 마지막 에러: (있다면)
```

이 양식이면 다음 fix 프롬프트가 정확히 어디를 고쳐야 할지 한 번에 판단 가능.

---

## §8 다음 블록

- 본 시나리오 §1 ~ §5 모두 통과 → v1 발송 검증 완료. 다음 작업은 검수중 환불 템플릿 통과 후 §6 재실행
- 막힌 단계 발견 → 챗 보고 → 별도 fix 프롬프트
