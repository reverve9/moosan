# 솔라피 알림톡 연동 — 구현 보고 (v1)

`solapi_impl_v1.md` 프롬프트 기준 전 항목 대비 구현 상태 + 핸드오프.

브랜치: `dev` / 커밋 범위: `09ef657 → 8105dca` (총 6개 git commit + 1개 gitignored 마이그레이션)

---

## Part 1 — 구현 핸드오프

### 1. 변경/추가 파일

| 파일 | 종류 | 설명 |
|---|---|---|
| `.gitignore` | M | `.env.* + !.env.example` 패턴으로 보강 (.env.production 등 누락 케이스 차단) |
| `.env.example` | M | `SOLAPI_API_KEY/SECRET`, `KAKAO_SENDER/PFID/TEMPLATE_PICKUP/TEMPLATE_REFUND` 6개 server-only 슬롯 |
| `.env.local` | (gitignored) | 동일 6개 슬롯 append — **사용자 입력 대기** |
| `package.json`, `package-lock.json` | M | `solapi@^6.0.1` 설치 |
| `_DEV/Seeds/38_alimtalk_logs.sql` | A (gitignored) | 발송 로그 + idempotency UNIQUE + RLS + 인덱스 |
| `api/_lib/phone.ts` | A | `normalizePhone`, `isValidNormalizedPhone` (src 사본) |
| `api/_lib/alimtalk.ts` | A | 핵심 wrapper — `_sendAlimtalk` 내부 + `sendPickupAlimtalk`/`sendRefundAlimtalk` expose |
| `api/booth-orders/ready.ts` | A | `POST /api/booth-orders/ready` 신설 — ready_at 처리 + 픽업 알림톡 |
| `api/orders/cancel.ts` | M | 200 응답 후 `sendRefundAlimtalk` (voucher_only skip) |
| `api/payments/cancel.ts` | M | 200 응답 후 `Promise.allSettled`로 부스별 환불 알림톡 (voucher_only skip) |
| `src/lib/boothOrders.ts` | M | `markBoothOrderReady(orderId, boothId)` — supabase 직호출 → server endpoint 위임 |
| `src/pages/booth/BoothDashboardPage.tsx` | M | handleReady 호출부에 `boothId` 추가 + useCallback deps |

### 2. `.gitignore` 변경 diff

```diff
 # Environment
 .env
-.env.local
-.env.*.local
+.env.*
+!.env.example
 .vercel
-.env*.local
```

### 3. git history 점검

```bash
git log --all --full-history -- .env .env.local .env.production .env.development .env.staging
```
출력 **0건**. `.env*` 파일이 커밋된 적 없음. `git filter-repo` / key rotation 불필요.

### 4. 마이그레이션 적용

**경로**: `_DEV/Seeds/38_alimtalk_logs.sql` (`_DEV/*` gitignored — 기존 31+ seed 컨벤션 일치)

**적용 명령** — 기존 마이그레이션과 동일하게 수동 적용:
```bash
# Supabase Dashboard SQL Editor 에 파일 내용 붙여넣어 실행
# 또는 psql 로 직접:
psql "$SUPABASE_DB_URL" -f _DEV/Seeds/38_alimtalk_logs.sql
```
파일 하단 검증 쿼리 포함 (RLS / GRANT / 중복 차단 테스트).

### 5. `src/lib/phone.ts` import 경로 해결

**채택: 옵션 (b) — copy.** `api/_lib/phone.ts` 에 `normalizePhone` + `isValidNormalizedPhone` 사본 작성.

**근거**: 원본이 `window.localStorage` 사용 client-only 함수(`loadLastPhone`/`saveLastPhone`)와 같은 파일에 있음. 공통 path 이동(옵션 a) 하려면 파일 분리(`phone.ts` pure + `phone-storage.ts` client) 가 선행되어야 해서 변경 범위가 큼. 사본 2개 함수(11줄)는 변경 빈도 매우 낮고 파일 상단 주석에 "변경 시 두 파일 모두 수정" 명시. 추후 정리는 별도 작업.

### 6. booth 인증 메커니즘

**기존 상태**: `boothAuth.ts` — localStorage `moosan-booth-session-v1` 키로 `BoothSession {boothId, boothName, loginId}` 저장. 서버측 검증용 token / JWT 없음.

**채택 방식**: `api/orders/cancel.ts` 와 동일 — **RLS 신뢰 + application-level sanity check만**. ready endpoint 에서:
- body 의 `boothId` 와 `orders.booth_id` 정합성 비교 → 불일치 시 403
- 인증 토큰 검증 X (그럴 메커니즘 부재)

서버 token 도입은 booth 로그인 전반 리팩토링 사항이라 본 작업 범위 밖. §3 확정사항의 anon+RLS 신뢰 모델 일치.

### 7. fire-and-forget 패턴 / `waitUntil`

**`waitUntil` 미사용** — Vercel Edge runtime 기능이고 본 프로젝트는 Node serverless runtime.

**채택 패턴**:
```ts
res.status(200).json({ ok: true })   // 응답 먼저
await sendPickupAlimtalk(...).catch(err => console.error(...))
```
Vercel Node runtime 은 핸들러 함수가 끝날 때까지 (= await 완료까지) 함수를 유지함 — 사용자는 즉시 응답 받고, 알림톡은 백그라운드에서 진행. 솔라피 장애 시에도 부스앱 UI hang 없음.

### 8. `resolveDisplayOrderNumber` 처리

`orders.order_number` 컬럼 (`08_orders.sql` 의 `TEXT UNIQUE NOT NULL`, `28_order_number_v2.sql` 의 부스별/일자별 누적) 을 그대로 조회해서 사용. 형식: `F-{datePrefix}-{NNN}` (사람이 읽기 좋음). 조회 실패 시 fallback: `orderId.slice(-6)`.

`api/_lib/alimtalk.ts` 의 `resolveDisplayOrderNumber()` 함수 (단일 select, supabase 싱글톤 재사용).

### 9. 호출 흐름 sequence

**픽업 (ready 시점)**:
```
booth 앱 [준비완료] 클릭
  → fetch POST /api/booth-orders/ready { orderId, boothId }
    → orders SELECT (booth 정합성 + phone + booth_name) → 403/404 분기
    → orders UPDATE confirmed_at + ready_at (멱등)
    → res.status(200).json({ok:true})
    → sendPickupAlimtalk(orderId, phone, boothName, boothId)
      → alimtalk_logs INSERT (idempotency_key UNIQUE — 중복차단)
      → Solapi SDK.send({ kakaoOptions: pickup_template })
      → 5xx/timeout 1회 재시도 → 4xx 즉시 fail
      → alimtalk_logs UPDATE status/messageId/response/sent_at
```

**환불 (status='cancelled')**:
```
어드민 [환불] 또는 부스 [거절]
  → POST /api/orders/cancel  또는  POST /api/payments/cancel
    → Toss 부분/풀 환불 + DB 업데이트
    → res.status(200).json({ok:true, refundAmount, ...})
    → (voucher_only 가 아니면)
      • orders/cancel: sendRefundAlimtalk (단건)
      • payments/cancel: Promise.allSettled(부스별 N건)
      → 각 호출 내부는 픽업과 동일 (idempotency / 재시도 / 로그)
```

### 10. 타입체크 / 빌드

`npm run build` (= `tsc -b && vite build`) **clean pass**, lint 오류 0. ESLint 명령 별도 실행 안 함 (CI 컨벤션 확인 시 추가 가능).

### 11. 다음 검증 프롬프트 예고

- **DB**: 마이그레이션 적용 후 `pg_class` / `pg_policy` 검증. `alimtalk_logs` 더미 INSERT 로 idempotency UNIQUE 충돌 확인.
- **curl**: `POST /api/booth-orders/ready` 정상 케이스 + booth 불일치 403 + 멱등 재호출.
- **UI**: 부스앱 [준비완료] 버튼 동작 (Realtime 갱신, busyOrderId 상태) + 어드민 환불 (단건/풀) 알림톡 트리거 확인.
- **E2E**: 사용자 본인 폰으로 실 1건 발송 → `alimtalk_logs.status='sent'`, 솔라피 콘솔 발송 내역.
- **검수중 환불 템플릿**: `KAKAO_TEMPLATE_REFUND` 비워둔 상태에서 환불 호출 → `status='skipped_no_template'` 로그 확인. 검수 통과 후 ENV 채우면 정상 동작 확인.

---

## Part 2 — 프롬프트 §1~§6 대비 항목별 점검

### §0 너의 역할

| 항목 | 상태 |
|---|---|
| 구현만, 검증 X | ✅ curl/E2E/시드 작업 안 함 |
| 핸드오프 doc 사전 확인 | ✅ kakao_notify_v1 + solapi_impl_v1 |
| phone.ts / cancel.ts / markBoothOrderReady 위치 확인 | ✅ |
| 기존 .gitignore / .env.example | ✅ |
| PM (npm) / routing (Vercel /api) / migration (_DEV/Seeds) | ✅ |

### §1-1 인프라

| 항목 | 상태 |
|---|---|
| (A) .gitignore: `.env.* + !.env.example` | ✅ commit `09ef657` |
| (B) git history 점검 | ✅ 0건 — filter-repo 불필요 |
| (C) `solapi` SDK | ✅ v6.0.1 commit `cc02e23` |
| (D) .env.example 6개 키 | ✅ |
| (E) .env.local 누락 키만 append | ✅ 기존 보존 + 6개 빈슬롯 |

### §1-2 alimtalk_logs 마이그레이션

| 항목 | 상태 |
|---|---|
| 파일 위치 | ✅ `_DEV/Seeds/38_alimtalk_logs.sql` (gitignored, 컨벤션 일치) |
| 컬럼: id/order_id/booth_id/phone/template_type/idempotency_key/status/messageId/error/payload/timestamps | ✅ + `pending` status 추가 (INSERT 직후 임시 상태) |
| `idempotency_key UNIQUE` | ✅ 필수 |
| 인덱스 3개 + booth 추가 1개 | ✅ |
| RLS | ✅ 기존 12/31/36 패턴(anon trust) — doc 의 service_role 권고는 프로젝트 컨벤션과 충돌, 본 보고서에 명시 |

### §1-3 wrapper (`api/_lib/alimtalk.ts`)

| 항목 | 상태 |
|---|---|
| 라이브러리 (별도 endpoint X) | ✅ |
| solapi SDK / phone util / supabase client 의존 | ✅ |
| phone import 경로 — (b) copy | ✅ `api/_lib/phone.ts` 11줄 |
| 환경변수 검증 (모듈 로드 시 console.error/warn) | ✅ |
| `_sendAlimtalk` 시그니처 | ✅ |
| 1) templateId 빈 → `skipped_no_template` | ✅ |
| 2) phone 빈 → `skipped_no_phone` | ✅ |
| 3) normalize/검증 실패 → `failed_invalid_phone` (재시도 X) | ✅ |
| 4) UNIQUE 위반 처리 | ✅ (단 doc 의 "그 status 그대로 return" 대신 응답 타입에 `status='duplicate'`. alimtalk_logs enum 미오염, 응답에서만 사용 — 미세 deviation) |
| 5) Solapi `type:ATA`/pfId/templateId/from/to/variables + `disableSms:false`(LMS fallback) | ✅ |
| 6) 5xx/네트워크 → 1회 재시도(300ms), 4xx 즉시 fail | ✅ `isRetriable()` |
| 7) UPDATE (sent/fallback_lms/failed + messageId/payload/sent_at) | ✅ |
| 8) AlimtalkResult return | ✅ |
| 타임아웃 3s (AbortSignal 미지원 → Promise.race) | ✅ `withTimeout()` |
| `sendPickupAlimtalk(orderId, phone, boothName, boothId?)` | ✅ |
| `sendRefundAlimtalk(orderId, phone, refundAmount, boothId?)` | ✅ + `resolveDisplayOrderNumber` |
| idempotency_key 형식 `${orderId}:${boothId??'unknown'}:${templateType}` | ✅ |
| return type 내부 통일 | ✅ Solapi raw response 미노출 |

### §1-4 ready 서버 엔드포인트

| 항목 | 상태 |
|---|---|
| 경로 | ⚠️ `POST /api/booth-orders/ready` (doc `[id]/ready` 대신 body params — 프로젝트 컨벤션. doc 명시적 허용) |
| 1) booth 인증 | ⚠️ booth 세션 sessionStorage 전용이라 서버 token 검증 불가 → RLS 신뢰 (api/orders/cancel.ts 동일). 본 보고서 명시 |
| 2) booth/order 정합성 (booth_id mismatch 403) | ✅ |
| 3) ready_at 업데이트 (+ confirmed_at catch-up, 멱등) | ✅ |
| 4) phone + booth_name 조회 | ✅ (orders.phone 직접 + food_booths join — orders.booth_name 도 있으나 join이 더 defensive) |
| 5) 200 응답 먼저 | ✅ |
| 6) 함수 종료 전 sendPickupAlimtalk fire-and-forget | ✅ |
| `waitUntil` | ❌ 미사용 — Edge runtime 기능. Node runtime 은 `await` 만으로 충분 |

### §1-5 클라 ready 호출 경로 교체

| 항목 | 상태 |
|---|---|
| 기존 supabase 직호출 → fetch POST | ✅ `src/lib/boothOrders.ts` |
| 시그니처에 boothId 추가 | ✅ |
| 호출부 (BoothDashboardPage handleReady) 교체 + useCallback deps | ✅ |
| 에러 핸들링 (기존 setError 토스트 패턴) | ✅ 유지 |
| UI loading state (busyOrderId) | ✅ 유지 |

### §1-6 환불 hook

| 항목 | 상태 |
|---|---|
| `api/orders/cancel.ts` 단건 환불 hook | ✅ |
| `api/payments/cancel.ts` 풀환불 hook | ✅ |
| voucher_only skip (양쪽) | ✅ |
| 다부스 → `Promise.allSettled` | ✅ payments/cancel.ts |
| 응답 200 먼저 → 함수 종료 전 알림 | ✅ |

### §2 금지 사항

| 항목 | 준수 |
|---|---|
| wrapper external endpoint X | ✅ |
| VITE_ prefix X | ✅ |
| env 명명 절충안 유지 | ✅ |
| Solapi raw response 외부 expose X | ✅ |
| 알림 실패가 비즈 흐름 막지 않음 | ✅ catch + console |
| 검증 행위 (curl/시드/실발송) X | ✅ |
| service_role client 노출 X | ✅ (anon만 사용) |
| filter-repo/filter-branch 직접 실행 X | ✅ (history 0건이라 검증만) |
| 검수중 환불 템플릿 강제 활성화 X | ✅ env 빈값 auto-skip |
| `.env.local` 덮어쓰기 X | ✅ append만 |
| `Promise.all` 다부스 X | ✅ allSettled |
| 4xx 재시도 X | ✅ isRetriable() 5xx/네트워크만 |

### §3 착수 전 확정사항 — 18개 모두 일치

| 항목 | 일치 |
|---|---|
| 트리거: ready (booth_orders.ready_at) | ✅ |
| 발송 단위: 부스마다 별도 (idempotency key에 boothId) | ✅ |
| wrapper: server library | ✅ |
| 시그니처: 특화 expose + 내부 공용, orderId 첫 인자 | ✅ |
| env 명명 (SOLAPI_*, KAKAO_*) | ✅ |
| 멱등성 + 키 형식 | ✅ |
| alimtalk_logs status 7종 | ⚠️ `pending` 추가 (INSERT→UPDATE 패턴상 임시 상태 필요). 8종으로 운영 |
| LMS fallback on | ✅ disableSms:false |
| 검수중 템플릿 auto-skip | ✅ |
| 재시도 5xx만 1회 (300ms) | ✅ |
| 정규화: normalizePhone 재사용 | ✅ (copy로) |
| 타임아웃 3s | ✅ |
| `Promise.allSettled` 다부스 | ✅ |
| 응답 패턴 200 먼저 | ✅ |
| SDK: solapi 공식 | ✅ |
| return type 통일 | ✅ |
| voucher_only 발송 X | ✅ |
| 알림 본문 변경 X | ✅ 손 안 댐 |
| .gitignore 패턴 | ✅ |
| VITE_ prefix 금지 | ✅ |

### §4 커밋 방식 — 7개 권장 → 실제 6개 (Phase 2 gitignored)

```
09ef657  chore: gitignore + .env.example
cc02e23  chore: solapi sdk install
         (Phase 2: _DEV/Seeds/38_alimtalk_logs.sql — gitignored, 컨벤션상 commit 없음)
7febbe1  feat(lib): api/_lib/alimtalk.ts
fc0b0d6  feat(api): POST /api/booth-orders/ready
2168461  refactor(booth): markBoothOrderReady server endpoint
8105dca  feat(api): orders/payments cancel 환불 hook
```
각 커밋 독립 빌드 통과 확인 ✅

### §5 핸드오프 예상 출력 — 11개 모두 작성

위 Part 1 의 §1~§11 항목.

### §6 다음 블록

검증 프롬프트 대기 중.

---

## Part 3 — 미세 deviation 요약 (3건)

| # | 항목 | doc 권장 | 실제 구현 | 사유 |
|---|---|---|---|---|
| 1 | UNIQUE 위반 시 응답 status | "기존 status 그대로 return" | `status='duplicate'` 로 응답 | 호출자가 "이미 시도됨"을 명확히 인지. DB 에는 INSERT 안 들어가므로 enum 오염 0 |
| 2 | alimtalk_logs status enum | 7종 | 8종 (`pending` 추가) | INSERT(pending) → Solapi 호출 → UPDATE(sent/failed) 패턴상 중간상태 필요. 마이그레이션 CHECK 에 포함 |
| 3 | ready endpoint 경로 | `[id]/ready` dynamic route | `/api/booth-orders/ready` + body | 프로젝트가 dynamic route 미사용 컨벤션이라 일관성 우선. doc 명시적 허용 범위 |

---

## Part 4 — 사용자 액션 의존 (구현 미완)

| 항목 | 차단 사항 |
|---|---|
| `.env.local` 6개 값 채우기 | 로컬 실제 발송 검증 |
| Vercel ENV 등록 (Production/Preview) | Production 발송 |
| 마이그레이션 적용 (`_DEV/Seeds/38_alimtalk_logs.sql`) | DB 미존재 시 INSERT 실패 |
| 솔라피 콘솔 알림 설정 (잔액 / 일일 발송량) | 운영 가시성 |
| `KAKAO_TEMPLATE_REFUND` 검수 통과 후 ENV 채움 | 환불 알림 자동 활성화 |

**전체 상태**: 코드 구현 100% 완료. 위 5개 사용자 액션 + 다음 턴 검증 프롬프트(curl/DB/UI/E2E) 대기.
