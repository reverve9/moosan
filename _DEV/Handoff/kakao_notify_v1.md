# 카카오톡 알림톡 연동 v1

> 픽업완료 / 환불안내 시점에 손님에게 카카오 알림톡 발송.
> 본 페이즈는 **후크 자리 정리 + 인터페이스 박기**까지. 실제 발송사/템플릿/키 적용은 v1 끝나고 사용자 결정 후 v1.1 로 이어감.

---

## 1. 배경

### 1-1. 알림 트리거 시점

| 시점 | 메시지 골자 | 발송 대상 |
|---|---|---|
| 픽업완료 | "수령 완료되었습니다 · 맛있게 드세요" 또는 "준비완료 — 픽업해주세요" 중 채택 | payment.phone |
| 환불안내 | "{매장명} 주문 {금액}원이 환불됐습니다 · 사유: {reason}" | payment.phone |

> 어느 시점에 발송할지는 사용자 확정 필요. 본 doc 작성 시점에 "픽업완료"는 컨펌됐고, "준비완료 알림" 도 추가 가능성 있음. 발송 시점이 늘어나면 §4 후크 자리도 늘어남 (markBoothOrderReady 도 endpoint 화).

### 1-2. 현재 후크 자리 — 핵심 모순

| 시점 | 현재 호출 위치 | server-side? |
|---|---|---|
| 환불 | `api/orders/cancel.ts` (Vercel serverless) | ✓ |
| 픽업완료 | `src/lib/boothOrders.ts:markBoothOrderPickedUp` (브라우저 → Supabase 직접) | ✗ |

픽업완료가 부스 클라이언트에서 supabase RLS 통해 직접 UPDATE 하는 구조라 카카오 발송할 서버 자리가 없음. 알림톡 secret + IP 화이트리스트 모두 클라이언트에 노출 불가 → endpoint 신설 필수.

### 1-3. IP 화이트리스트 제약

카카오 비즈메시지(알림톡)는 발송 서버 IP 화이트리스트 등록이 통상 필요. Vercel 기본 플랜은 **고정 IP 없음** (큰 IP 풀에서 회전).

해결안:
- (A) Vercel Pro Static IP 애드온 — 월 정액
- (B) **국내 발송사 경유** (솔라피 / 알리고 / 스윗트래커 등) — 발송사 IP 가 카카오 BIZ 에 등록돼있어 우리 IP 는 무관 → **권장**

본 doc 은 (B) 가정. 발송사는 사용자가 결정. 인터페이스만 발송사-agnostic 하게 박아둠.

---

## 2. 작업 원칙

- **후크 자리 우선 확정** — 실제 발송 코드는 발송사 결정 후. 빈 함수 / TODO 주석으로 놔둬도 OK
- **DB 변경이 항상 우선** — 알림 실패가 픽업/환불 처리를 막으면 안 됨. 알림 실패는 console.error + Sentry(있다면) 로 추적, 200 응답은 그대로
- **인터페이스는 발송사-agnostic** — `sendPickupAlert(...)` 시그니처가 솔라피든 알리고든 동일하게 동작하도록
- **secret 은 환경변수만** — 코드 / git 에 절대 박지 않음
- **부스 클라이언트는 endpoint 만 호출** — supabase 직접 호출 제거 (markBoothOrderPickedUp 의 경우)

---

## 3. 환경변수 (이름 확정, 값은 발송사 결정 후)

```
# .env.local / Vercel Project Settings
KAKAO_PROVIDER=solapi          # 또는 aligo / sweettraker
KAKAO_API_KEY=...
KAKAO_API_SECRET=...
KAKAO_SENDER_ID=...            # 발신 프로필 (PFID, 채널 ID 등 발송사별 명칭 다름)
KAKAO_TEMPLATE_PICKUP=...      # 알림톡 템플릿 코드 (사전 등록)
KAKAO_TEMPLATE_REFUND=...
```

발송사가 솔라피로 정해질 가능성이 가장 높음 — 한국 RaaS 중 docs/SDK 가장 깔끔. 알리고는 가격 저렴하지만 SDK 가 옛날 PHP 스타일.

---

## 4. API 신규

### 4-1. `POST /api/orders/[id]/pickup`

- 본문: `{ orderId: string }`  (path param 으로 [id] 잡으면 body 생략 가능, 패턴 통일을 위해 cancel.ts 처럼 body 사용)
- 검증:
  - `order` 존재 + `ready_at IS NOT NULL` + `picked_up_at IS NULL`
  - 미충족 시 409 + code: `ORDER_NOT_READY` / `ORDER_ALREADY_PICKED_UP`
- 처리:
  1. `UPDATE orders SET picked_up_at = NOW(), status = 'completed' WHERE id = $1 AND ready_at IS NOT NULL AND picked_up_at IS NULL`
     - 0행 업데이트 시 race 로 보고 409
  2. payments 행 조회 (phone 확보)
  3. **`sendPickupAlert(...)` 호출 — try/catch 로 감싸고 실패 시 console.error 만**
  4. 200 + `{ ok: true, orderId, picked_up_at }`
- 인증: 부스 sessionStorage 기반이라 본 endpoint 는 사실상 anon. RLS 통과만 보장하면 됨 (cancel.ts 와 동일 정책). 추후 booth 인증 정식화되면 같이 강화.

### 4-2. `api/orders/cancel.ts` 후크 자리 추가

기존 처리 흐름 그대로 두고, **응답 직전** 에 발송 호출:

```ts
// (서버 응답 직전, DB 업데이트 모두 성공 후)
try {
  await sendRefundAlert({
    phone: payment.phone,
    boothName: order.booth_name,
    refundAmount,
    reason,
    isFullCancel: reachedFull,
  })
} catch (err) {
  console.error('[refund alert] send failed', err)
}
```

`force` 환불도 동일 흐름. 발송 실패가 환불 결과에 영향 X.

---

## 5. 발송 모듈 (`api/_lib/kakao.ts`)

새 파일. 발송사 wrapper 의 진입점.

```ts
// api/_lib/kakao.ts

interface PickupAlertInput {
  phone: string         // 010xxxxxxxx (정규화된 11자리)
  boothName: string
  orderNumber: string
}

interface RefundAlertInput {
  phone: string
  boothName: string
  refundAmount: number
  reason: string
  isFullCancel: boolean  // 결제 전체 취소 여부 (메시지 분기용)
}

export async function sendPickupAlert(input: PickupAlertInput): Promise<void> {
  if (!process.env.KAKAO_API_KEY) {
    console.warn('[kakao] KAKAO_API_KEY missing — skipping pickup alert')
    return
  }
  // TODO: 발송사 결정 후 구현
  // 솔라피: https://api.solapi.com/messages/v4/send
  // 템플릿 코드 + 변수 치환 (예: #{매장명}, #{주문번호}) → API 호출
  console.log('[kakao] pickup alert (stub):', input)
}

export async function sendRefundAlert(input: RefundAlertInput): Promise<void> {
  if (!process.env.KAKAO_API_KEY) {
    console.warn('[kakao] KAKAO_API_KEY missing — skipping refund alert')
    return
  }
  // TODO: 발송사 결정 후 구현
  console.log('[kakao] refund alert (stub):', input)
}
```

v1 완료 시점: stub 만 존재. v1.1 에서 실제 fetch / SDK 호출로 교체.

### 5-1. 템플릿 변수 가이드 (사전 등록 시)

알림톡은 "사전 검수된 템플릿" 만 발송 가능. 가능한 한 변수 적게.

**픽업완료 (예시)**

```
[설악무산문화축전]
주문번호: #{주문번호}
{매장명} 주문 음식 수령이 완료되었습니다.
맛있게 드세요!
```

**환불안내 (예시)**

```
[설악무산문화축전]
{매장명} 주문 #{주문번호} 가 환불 처리됐습니다.
- 환불 금액: #{환불금액}원
- 사유: #{사유}
영업일 기준 3~5일 내 결제 수단으로 환급됩니다.
```

승인 받기 전엔 SMS 폴백으로 동일 문구 발송 권장 (대부분 발송사가 알림톡 실패 시 자동 SMS 폴백 옵션 제공).

---

## 6. 부스 클라이언트 — markBoothOrderPickedUp 전환

`src/lib/boothOrders.ts:markBoothOrderPickedUp` 을 supabase 직접 → endpoint POST 로 전환.

```ts
export async function markBoothOrderPickedUp(orderId: string): Promise<void> {
  const response = await fetch(`/api/orders/${orderId}/pickup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId }),
  })
  const json = await response.json().catch(() => ({}))
  if (!response.ok) {
    const msg = typeof json?.error === 'string' ? json.error : '픽업완료 처리 실패'
    throw new Error(msg)
  }
}
```

- BoothDashboardPage 호출부는 변경 없음 (낙관적 업데이트 유지)
- 에러 응답 시 throw → 기존 try/catch 가 잡아서 setError

---

## 7. 확정 사항 (질문 금지)

| Q | 결정 |
|---|---|
| 발송 채널 | 카카오 알림톡 (SMS 폴백은 발송사 옵션) |
| IP 화이트리스트 | 국내 발송사 경유로 우회 (Vercel IP 고정 X) |
| 알림 실패 정책 | DB 변경 우선 commit, 알림 실패는 console.error + 200 응답 유지 |
| 발송 시점 (v1) | 픽업완료 / 환불(부스 거절·어드민·강제 모두) |
| 발송 시점 (보류) | 준비완료 — 손님 PWA 알림으로 충분히 잡힘. 카카오 발송 추가는 v2 검토 |
| secret 보관 | Vercel 환경변수만. .env.local 은 dev 전용 |
| 발송 모듈 위치 | `api/_lib/kakao.ts` (api/ 안 \_lib 폴더 신설) |
| 템플릿 사전 등록 | 사용자 책임 (카카오 비즈채널 + 발송사 콘솔) |
| markBoothOrderPickedUp 변경 | supabase 직접 → endpoint POST 로 전환 (server hook 자리 확보) |
| markBoothOrderReady 변경 | v1 에선 X (준비완료 알림 보류라 후크 자리 불필요) |

---

## 8. 작업 순서 (다음 세션)

1. **`api/_lib/kakao.ts`** 신설 — stub 함수 2개 (sendPickupAlert / sendRefundAlert)
2. **`api/orders/[id]/pickup.ts`** 신설 — Vercel dynamic route. 검증 → DB UPDATE → sendPickupAlert (try/catch) → 200
   - `api/orders/[id]` 폴더로 만들고 그 안에 `pickup.ts` 두는 게 Vercel filesystem routing 에 맞음. 또는 `api/orders/pickup.ts` + body 로 orderId 받기 (cancel.ts 패턴) — **후자 추천 (테스트 단순)**
3. **`src/lib/boothOrders.ts:markBoothOrderPickedUp`** 을 endpoint POST 로 변경
4. **`api/orders/cancel.ts`** — 응답 직전에 sendRefundAlert 호출 추가
5. 환경변수 placeholder 추가 (`.env.example` 같은 게 있다면), 없으면 README 한 줄
6. `npx tsc --noEmit` + `npx vite build` 통과 확인
7. (발송사 결정됐다면) stub 을 실제 호출로 교체

3까지가 인프라, 4가 환불 후크. 5~6은 마무리. 7은 발송사 결정 시점에 별도 작업.

---

## 9. 검증 절차 — 작업 완료 후 사용자 실행

### 9-1. 픽업완료 endpoint

- [ ] 부스 대시보드에서 ready 카드 [픽업완료] 클릭 → 우측 완료 영역 이동
- [ ] DB: `picked_up_at` 채워짐, `status='completed'`
- [ ] Vercel 함수 로그에 `[kakao] pickup alert (stub):` 라인 노출 (실제 발송은 stub)
- [ ] 같은 주문에 [픽업완료] 재호출 시 409 (ORDER_ALREADY_PICKED_UP)
- [ ] ready_at 없는 상태에서 호출 시 409 (ORDER_NOT_READY)

### 9-2. 환불 후크

- [ ] AdminOrders 모달에서 환불 → DB 정상 업데이트 + 로그에 `[kakao] refund alert (stub):` 노출
- [ ] 발송 stub 이 throw 해도 환불 응답은 200 (실패 격리)

### 9-3. 부스 클라이언트

- [ ] markBoothOrderPickedUp 이 endpoint 통해 동작 (Network 탭에서 `/api/orders/.../pickup` POST 확인)
- [ ] supabase 직접 update 호출 흔적 없음

---

## 10. 빌드 검증

`npx tsc --noEmit` + `npx vite build` 통과.

---

## 11. 커밋 메시지 (예상)

```
feat(notify): scaffolding for kakao alert hooks (stub)

- api/_lib/kakao.ts: sendPickupAlert / sendRefundAlert stubs
- api/orders/pickup.ts: Vercel endpoint, ready_at 검증 후 picked_up_at + status='completed'
- markBoothOrderPickedUp: supabase 직접 → endpoint POST 전환 (server hook 자리 확보)
- api/orders/cancel.ts: 응답 직전 sendRefundAlert 호출 (실패 격리)
- 환경변수 KAKAO_* 6종 (값은 발송사 결정 후 채움)
```

---

## 12. 후속 (v1.1 — 별도 페이즈)

- 발송사 결정 → SDK 또는 fetch 로 stub 교체
- 알림톡 템플릿 카카오 비즈채널 등록 → 템플릿 코드 환경변수에 채움
- SMS 폴백 옵션 (발송사 콘솔에서 default ON)
- 발송 로그 테이블 — 누구한테 언제 무슨 메시지 보냈는지. 분쟁 추적용. 별도 v2 검토
- 발송 실패 retry — 현재는 격리만. retry 가 필요한지 행사 후 평가
- 어드민 발송 통계 — 알림톡 발송 건수 / 실패율. 필요 시 v2

---

## 13. 참고

- pickup_complete_v1.md — 픽업완료 단계 도입 (v1 완료, 본 작업의 전제)
- alcohol_consent_v1.md — 주류 동의 흐름 (알림 메시지 분기 영향 없음)
- help_desk_v1.md — 결제 도우미 (assisted_by 결제도 동일하게 알림 발송 대상)
