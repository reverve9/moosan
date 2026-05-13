# 솔라피 알림톡 연동 — 구현 프롬프트 v1

## §0 너의 역할

이 턴은 **구현만**. 검증 (curl 테스트, DB 쿼리 실행, UI 점검, E2E) 은 다음 턴 별도 프롬프트로.

**작업 시작 전 필수 확인:**
1. 코드베이스 안의 핸드오프 doc (`솔라피 알림톡 연동 핸드오프` 또는 알림톡/kakao 관련 .md) 읽기 — 발송 시점 / 변수 매핑 / hook 자리 정의되어 있음
2. `src/lib/phone.ts` (정규화/검증 유틸 위치)
3. `api/orders/cancel.ts` 또는 그에 상당하는 환불 처리 함수
4. booth 앱의 `markBoothOrderReady` (또는 그에 상당하는 ready 처리 함수) 호출부
5. 기존 `.gitignore`, `.env.example` 상태
6. 프로젝트 PM (pnpm / npm / yarn), routing 컨벤션 (Vercel `/api/*` 또는 다른 패턴), Supabase migration 디렉터리 위치

판단 요청 생기면 보고 후 대기. 사용자에게 직접 질문 X (이 챗이 받아서 결정 후 답함).

---

## §1 작업 범위

### 1-1. 인프라 세팅 (가장 먼저)

**(A) `.gitignore` 즉시 보완** — 솔라피와 별개로 즉시 처리

현재 패턴 `.env`, `.env.local`, `.env.*.local`, `.env*.local` 은 `.env.production`, `.env.development`, `.env.staging` 같은 환경별 파일을 커버하지 않음.

변경 후 패턴:
```
.env
.env.*
!.env.example
```

**(B) git history 점검**
```bash
git log --all --full-history -- .env .env.local .env.production .env.development
```
출력 결과 보고. **commit 흔적 발견 시:**
- commit hash 와 어느 파일이 노출됐는지 보고
- **`git filter-repo` / `git filter-branch` 직접 실행 X** — 이 챗에 보고 후 사용자 결정
- 노출됐다면 솔라피뿐 아니라 그 시점의 모든 비밀 (Toss secret, Supabase service_role, …) rotate 필요 — 권고만 하고 실행 X

**(C) SDK 설치**
```bash
pnpm add solapi   # 프로젝트 PM 확인 후 일치하는 명령으로
```
공식 `solapi` npm (구 `coolsms-node-sdk` 후속).

**(D) `.env.example` 추가/업데이트**
```
SOLAPI_API_KEY=
SOLAPI_API_SECRET=
KAKAO_SENDER=
KAKAO_PFID=
KAKAO_TEMPLATE_PICKUP=
KAKAO_TEMPLATE_REFUND=
```
`VITE_` prefix 절대 X. 클라이언트 코드에서 import / 참조 X.

**(E) `.env.local` 생성/보강** — 사용자가 콘솔에서 받은 값 채울 빈 슬롯

- **`.env.local` 이 없으면:** `.env.example` 의 6개 키를 빈값으로 복사해 생성
- **`.env.local` 이 이미 있으면:** 기존 내용 **절대 덮어쓰지 말 것**. 위 6개 키 중 누락된 것만 빈값으로 append (기존 Supabase / Toss / 다른 envvar 보호)
- 파일 끝에 한 줄 주석 추가: `# Solapi 키는 콘솔에서 발급 후 채워넣을 것 (console_setup_checklist.md A-1 참조)`
- `.gitignore` 패턴 (`.env.*` + `!.env.example`) 으로 commit 차단됨 확인

---

### 1-2. Supabase 마이그레이션 — `alimtalk_logs` 테이블

마이그레이션 파일 추가. 권장 스키마 (조정 가능하나 `idempotency_key UNIQUE` 는 필수):

```sql
CREATE TABLE alimtalk_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id),
  booth_id UUID REFERENCES food_booths(id),
  phone TEXT NOT NULL,
  template_type TEXT NOT NULL CHECK (template_type IN ('pickup', 'refund')),
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN (
    'sent',
    'failed',
    'failed_invalid_phone',
    'fallback_lms',
    'skipped_no_phone',
    'skipped_no_template'
  )),
  solapi_message_id TEXT,
  error_code TEXT,
  error_message TEXT,
  request_payload JSONB,
  response_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ
);

CREATE INDEX idx_alimtalk_logs_order ON alimtalk_logs(order_id);
CREATE INDEX idx_alimtalk_logs_status ON alimtalk_logs(status);
CREATE INDEX idx_alimtalk_logs_created ON alimtalk_logs(created_at DESC);
```

RLS:
- 어드민 role 만 SELECT 가능 (기존 어드민 정책 패턴 따라)
- INSERT / UPDATE 는 service_role 만

`food_booths` 테이블명이 다르면 실제 테이블명으로 교체. `orders` 테이블의 PK가 UUID 가 아니면 타입 맞춤.

---

### 1-3. `api/_lib/alimtalk.ts` — 서버 라이브러리

**파일 위치:** `api/_lib/alimtalk.ts` (또는 프로젝트의 server-only 공용 lib 위치)

⚠️ **별도 `/api/alimtalk/*` 엔드포인트 만들지 말 것.** wrapper 는 다른 server route 가 import 해서 쓰는 라이브러리. 외부 진입점 없음 = 호출 인증 문제 자체가 소멸 (G 자유 의견 적용).

**의존성:**
- `solapi` SDK
- `src/lib/phone.ts` 의 `normalizePhone`, `isValidPhone` — `api/` 에서 import 경로 확인 필요
  - 만약 Vite 와 Vercel API 가 별도 번들이라 직접 import 안 되면 옵션:
    - (a) `src/lib/phone.ts` 를 공통 path (예: `lib/` 루트) 로 이동
    - (b) `api/_lib/phone.ts` 에 동일 함수 복사 — 단 "정규화 로직은 한 곳에" 원칙 깨지므로 (a) 우선
  - 어느 옵션 택했는지 핸드오프 보고에 명시
- Supabase server client (service_role)

**환경변수 검증 (모듈 로드 시 1회):**
```ts
if (!process.env.SOLAPI_API_KEY || !process.env.SOLAPI_API_SECRET 
    || !process.env.KAKAO_SENDER || !process.env.KAKAO_PFID) {
  console.error('[alimtalk] core env not set — all alimtalk sends will fail')
}
if (!process.env.KAKAO_TEMPLATE_PICKUP) {
  console.warn('[alimtalk] KAKAO_TEMPLATE_PICKUP not set — pickup alerts disabled')
}
if (!process.env.KAKAO_TEMPLATE_REFUND) {
  console.warn('[alimtalk] KAKAO_TEMPLATE_REFUND not set — refund alerts disabled (검수중)')
}
```

**내부 함수 시그니처:**
```ts
type AlimtalkResult = { ok: boolean; messageId?: string; error?: string }

async function _sendAlimtalk(params: {
  templateId: string | undefined
  phone: string | null | undefined
  variables: Record<string, string>
  idempotencyKey: string
  orderId: string
  boothId?: string
  templateType: 'pickup' | 'refund'
}): Promise<AlimtalkResult>
```

**처리 흐름:**
1. `templateId` 빈/undefined → `alimtalk_logs` INSERT `status='skipped_no_template'` 후 return `{ ok: false, error: 'no_template' }`
2. `phone` 빈/null → `status='skipped_no_phone'` 후 return
3. `normalizePhone(phone)` 호출 → `isValidPhone(normalized)` 실패 → `status='failed_invalid_phone'` 후 return (재시도 X)
4. `alimtalk_logs` INSERT with `idempotency_key`:
   - UNIQUE 위반 (Postgres `23505`) → 기존 row 조회
     - 기존 `status='sent'` 또는 `'fallback_lms'` → return `{ ok: true, messageId: 기존거 }`
     - 다른 status → 그 status 그대로 return (중복 시도 차단)
5. Solapi SDK 호출:
   - `type: 'ATA'` (알림톡)
   - `pfId: process.env.KAKAO_PFID`
   - `templateId: <pickup or refund>`
   - `from: process.env.KAKAO_SENDER`
   - `to: normalized phone`
   - `variables` 매핑 (`#{매장명}` → 매장명, 등)
   - **LMS fallback on**: SDK 의 `fallback` 옵션 활용 (`type: 'LMS'`, 본문은 SDK 가 알림톡 본문으로 자동 또는 별도 지정)
   - `signal: AbortSignal.timeout(3000)`
6. **5xx 또는 네트워크 에러만** 200~500ms 백오프 후 1회 재시도. **4xx 즉시 fail** (재시도 X).
7. `alimtalk_logs` UPDATE:
   - 성공: `status='sent'` (또는 fallback 으로 발송됐으면 `'fallback_lms'`), `solapi_message_id`, `response_payload`, `sent_at`
   - 실패: `status='failed'`, `error_code`, `error_message`, `response_payload`
8. return `AlimtalkResult`

**외부 expose 함수:**
```ts
export async function sendPickupAlimtalk(
  orderId: string,
  phone: string | null | undefined,
  boothName: string,
  boothId?: string
): Promise<AlimtalkResult> {
  return _sendAlimtalk({
    templateId: process.env.KAKAO_TEMPLATE_PICKUP,
    phone,
    variables: { 매장명: boothName },
    idempotencyKey: `${orderId}:${boothId ?? 'unknown'}:pickup`,
    orderId,
    boothId,
    templateType: 'pickup',
  })
}

export async function sendRefundAlimtalk(
  orderId: string,
  phone: string | null | undefined,
  refundAmount: number,
  boothId?: string
): Promise<AlimtalkResult> {
  // orders 테이블에서 사람이 읽기 좋은 짧은 식별자 조회
  // orders.order_number 같은 컬럼 있으면 그것, 없으면 orderId.slice(-6) 같은 짧은 대체
  // → 어떤 방식으로 했는지 핸드오프 보고에 명시
  const displayOrderNumber = await resolveDisplayOrderNumber(orderId)
  return _sendAlimtalk({
    templateId: process.env.KAKAO_TEMPLATE_REFUND,
    phone,
    variables: {
      주문번호: displayOrderNumber,
      환불금액: refundAmount.toLocaleString('ko-KR'),
    },
    idempotencyKey: `${orderId}:${boothId ?? 'unknown'}:refund`,
    orderId,
    boothId,
    templateType: 'refund',
  })
}
```

**idempotency_key 형식 주의:** 다부스 결제 시 같은 orderId 라도 booth 별로 별도 발송이 필요하므로 booth_id 포함. handoff doc 의 "부스마다 별도 알림 발송" 정책 일치.

**return type 통일:** Solapi SDK 의 raw response 그대로 노출 X. 항상 `AlimtalkResult` 내부 타입. 벤더 교체 시 호출부 영향 0.

---

### 1-4. ready 서버 엔드포인트 신설

**경로:** `POST /api/booth-orders/[id]/ready` (또는 프로젝트 routing 컨벤션. 기존 `api/orders/cancel.ts` 형태 따라)

**현재 상태:** booth 앱의 `markBoothOrderReady` 가 client → Supabase 직접 호출. server-side 진입점 없음.

**처리 흐름:**
```ts
// pseudo
1. booth 인증 검증 (기존 booth 세션 메커니즘 확인 후 적용)
2. booth_orders 권한 확인 (해당 부스 소유 주문인지 — 다른 부스가 임의 ready 처리 못 하게)
3. booth_orders.ready_at = now() 업데이트
4. payments 에서 phone 조회 + booths 에서 booth_name 조회 (또는 join)
5. res.status(200).json({ ok: true })   ← 응답 먼저!
6. 함수 종료 전 백그라운드 처리:
   const sendPromise = sendPickupAlimtalk(orderId, phone, boothName, boothId)
     .catch(() => { /* alimtalk_logs 에 이미 기록됨 */ })
   await sendPromise
```

**중요 — fire-and-forget on path:**
- API 응답을 Solapi 응답에 묶지 말 것 (Solapi 장애 시 부스앱 hang)
- Vercel `waitUntil` 가용하면 사용 (`export const config = { ... }` 등)
- `waitUntil` 미가용 환경이면 `res.json()` 후 `await sendPromise` 패턴 (Vercel 이 함수 종료 전까지 기다림)

**RLS 권한 재검증:** 기존 client 직호출 시 booth_orders 에 어떤 RLS 가 걸려 있었는지 확인. server-side 에서 service_role 사용 시 application-level 권한 체크 필수.

---

### 1-5. 클라이언트 ready 호출 경로 교체

booth 앱 (`src/...` 아래 booth 관련 코드)의 기존 `markBoothOrderReady` 함수:
- **기존:** Supabase 직호출 (`booth_orders.update({ ready_at: ... })`)
- **변경:** `POST /api/booth-orders/[id]/ready` 호출

기존 호출부 모두 찾아서 교체. UI 동작 / loading state 유지.

에러 핸들링:
- 200 → 기존 success 로직
- 4xx / 5xx → 사용자에게 토스트/배너 알림 ("준비완료 처리 실패 — 다시 시도해주세요"). booth 앱의 기존 에러 알림 패턴 따라.

---

### 1-6. 환불 쪽 알림톡 hook 추가

위치: 기존 환불 처리 함수 (`api/orders/cancel.ts` 또는 핸드오프 doc 에 언급된 `help_desk_v1` 작업 결과물 안에 있는 cancel handler)

**method 분기 (핸드오프 doc 정책):**
- `voucher_only` (식권 100% 환불) → 알림 발송 **skip**
- PG / 외부카드 / 현금 환불 → 알림 발송

**다부스 환불 시 동시 발송:**
```ts
const refundPromises = boothRefunds.map(({ boothId, refundAmount }) =>
  sendRefundAlimtalk(orderId, phone, refundAmount, boothId)
)
await Promise.allSettled(refundPromises)   // ⚠️ Promise.all 아님
```

**응답 패턴 동일:**
1. status 업데이트
2. 200 응답 먼저
3. 함수 종료 전 알림 처리

---

## §2 금지 사항

- ❌ wrapper 를 외부 endpoint (`/api/alimtalk/*`) 로 만드는 것 — 라이브러리만
- ❌ 환경변수에 `VITE_` prefix 붙이는 것
- ❌ 환경변수 명명 절충안 변경 (예: 전부 `SOLAPI_*` 로 통일 변경하거나, 전부 `KAKAO_*` 로 변경)
- ❌ Solapi SDK 의 raw response 를 외부 expose (벤더 교체 대비 내부 타입 wrap)
- ❌ 알림 실패가 비즈 로직 (주문 상태 변경, 환불 처리) 막는 흐름
- ❌ 검증 행위 (curl, 실제 발송 테스트, 시드 데이터 작성, DB 직접 쿼리 실행) — 다음 턴 별도 프롬프트
- ❌ Supabase service_role key 클라이언트 노출
- ❌ `git filter-repo` / `git filter-branch` 직접 실행 (보고만, 사용자 결정 후 별도)
- ❌ 검수중 환불 템플릿 강제 활성화 (env 빈 값 자동 skip 로직 우회 X)
- ❌ 4xx 응답 재시도
- ❌ 기존 `.env.local` 덮어쓰기 (다른 envvar 손실 방지 — 누락 키만 append)
- ❌ `Promise.all` 로 다부스 환불 발송 (한 건 실패가 나머지 막음 — 반드시 `Promise.allSettled`)

---

## §3 착수 전 확정 사항

이 챗에서 사용자와 협의로 확정됨. **재질문 X, 그대로 구현.**

| 항목 | 값 |
|---|---|
| 트리거 시점 (픽업) | **ready (조리완료)** = `booth_orders.ready_at` 업데이트 시점. pickup-complete 시점 아님 |
| 발송 단위 | 결제 1건이라도 부스마다 별도 발송 (다부스 카트) |
| wrapper 형태 | server library (`api/_lib/alimtalk.ts`), 별도 endpoint X |
| 시그니처 | 특화 expose + 내부 공용. `orderId` 가 첫 인자 |
| 환경변수 (벤더 식별) | `SOLAPI_API_KEY`, `SOLAPI_API_SECRET` |
| 환경변수 (도메인 자산) | `KAKAO_SENDER`, `KAKAO_PFID`, `KAKAO_TEMPLATE_PICKUP`, `KAKAO_TEMPLATE_REFUND` |
| 멱등성 | `alimtalk_logs.idempotency_key UNIQUE`, 키 형식 `${orderId}:${boothId}:${templateType}` |
| 발송 로그 | `alimtalk_logs` 테이블 (status 7종 enum) |
| LMS fallback | on (Solapi SDK `fallback` 옵션) |
| 검수중 환불 템플릿 | env 빈 값이면 자동 skip (`status='skipped_no_template'`). 검수 통과 후 env 채우면 활성화 |
| 재시도 | 5xx / 네트워크 에러만 1회 (200~500ms 백오프). 4xx 즉시 fail |
| 전화번호 정규화 | `src/lib/phone.ts` 의 `normalizePhone` / `isValidPhone` 재사용 (DB 는 이미 `01012345678` 11자리 무하이픈) |
| 타임아웃 | Solapi 호출당 `AbortSignal.timeout(3000)` |
| 다부스 환불 동시 발송 | `Promise.allSettled` |
| API 응답 패턴 | 200 응답 먼저 → 함수 종료 전 알림 처리 (fire-and-forget on path) |
| SDK | `solapi` npm 공식 |
| return type | `{ ok: boolean, messageId?: string, error?: string }` 내부 타입 통일 |
| 식권 (voucher_only) 환불 | 알림 발송 X |
| 알림 본문 변경 | X — 검수 통과된 본문 그대로 (행사 직전 재검수 위험) |
| `.gitignore` | `.env`, `.env.*`, `!.env.example` 패턴으로 보완 |
| API key client 노출 보호 | `VITE_` prefix 금지. (선택) pre-commit grep hook 으로 자동 차단 — 시간 남으면 |

---

## §4 커밋 방식

단계별 atomic commit 권장. 한국어 메시지 또는 프로젝트 컨벤션 일치:

1. `chore: gitignore env 패턴 보완 + .env.example 추가`
2. `chore: install solapi sdk`
3. `feat(db): alimtalk_logs 테이블 마이그레이션`
4. `feat(lib): api/_lib/alimtalk.ts server library`
5. `feat(api): POST /api/booth-orders/[id]/ready 엔드포인트`
6. `refactor(booth): markBoothOrderReady server endpoint 호출로 마이그레이션`
7. `feat(api): orders/cancel 환불 알림톡 hook 추가 (voucher_only 제외)`

각 커밋은 독립적으로 빌드/테스트 통과 가능해야 함.

---

## §5 핸드오프 예상 출력 (구현 보고 시 포함)

1. **변경/추가 파일 목록** — 경로 + 한 줄 설명
2. **`.gitignore` 변경 diff**
3. **git history 점검 결과** — `git log --all --full-history -- .env*` 출력 (또는 "흔적 없음"). 흔적 있으면 commit hash 와 다음 액션 권고 (실행 X)
4. **migration 파일 경로** + 사용자가 적용해야 할 명령어 (예: `supabase db push` 또는 SQL 직접 실행)
5. **`src/lib/phone.ts` import 경로 해결 방식** — (a) 공통 path 이동 / (b) api/_lib 에 복사 / (c) 다른 방식
6. **booth 인증 메커니즘** — ready endpoint 에서 어떻게 인증/권한 확인했는지
7. **`waitUntil` 가용 여부** + 채택한 fire-and-forget 패턴
8. **`resolveDisplayOrderNumber` 처리 방식** — 어떤 컬럼/형식으로 사람이 읽기 좋은 주문번호 만들었는지
9. **호출 흐름 sequence** (pickup / refund 각각 3~5줄)
10. **TypeScript 타입 오류 / lint 0** 확인
11. **다음 검증 프롬프트에서 다룰 항목 예고**:
    - DB (alimtalk_logs 시드, idempotency UNIQUE 충돌 검증)
    - curl (ready endpoint 직접 호출)
    - UI (booth 앱 ready 버튼 동작, 어드민 환불)
    - E2E (사용자 본인 폰으로 실제 1건 발송)

---

## §6 다음 블록 예고

구현 보고 받은 후 별도 턴에서:
- **검증 프롬프트** (DB / curl / UI / E2E 절차) — 사용자가 직접 실행
- 사용자의 콘솔 작업 (Vercel ENV 등록, Solapi 임계치 알림) 병렬 진행 중
- 두 작업 끝나면 검증 실행 → 결과 챗에 보고 → 챗 판정 → 필요 시 fix 프롬프트

검증 중 코드 수정 필요 발견 시 → 별도 fix 프롬프트로 받음. 검증 프롬프트 자체에서 코드 수정 X.

---

## 참고: 호출 흐름 도식

```
[픽업 — ready 시점]
booth 앱 [준비완료] 클릭
  ↓
POST /api/booth-orders/[id]/ready
  ├─ booth 세션 검증
  ├─ booth_orders 권한 확인 (해당 부스 소유 주문인지)
  ├─ booth_orders.ready_at 업데이트
  ├─ phone, boothName 조회
  ├─ res.status(200).json({ ok: true })   ← 응답 먼저
  └─ (함수 종료 전) sendPickupAlimtalk(orderId, phone, boothName, boothId)
        ├─ env 검증 → 빈 값이면 skip
        ├─ normalizePhone + isValidPhone
        ├─ alimtalk_logs INSERT (idempotency_key UNIQUE — 중복 차단)
        ├─ Solapi SDK call (LMS fallback on, timeout 3s)
        ├─ 5xx/네트워크 → 1회 재시도, 4xx → 즉시 fail
        └─ alimtalk_logs UPDATE (status / solapi_message_id / response)


[환불 — status=cancelled 시점]
어드민 [환불] / 부스 [거절]
  ↓
api/orders/cancel.ts (또는 그에 상당)
  ├─ method 분기 (voucher_only → 발송 skip)
  ├─ orders.status = 'cancelled'
  ├─ res.status(200).json({ ok: true })   ← 응답 먼저
  └─ (함수 종료 전) Promise.allSettled([
        sendRefundAlimtalk(orderId, phone, booth1Refund, booth1.id),
        sendRefundAlimtalk(orderId, phone, booth2Refund, booth2.id),
        ...
      ])
```
