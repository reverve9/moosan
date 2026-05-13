# 쿠키페이(키움페이) 결제 연동 — 구현 프롬프트 v1

## §0 너의 역할

이 턴은 **구현만**. 검증(curl 테스트, DB 쿼리, UI 점검, E2E)은 다음 턴 별도 프롬프트로.

작업 시작 전 필수 확인:
1. 기존 핸드오프 문서 읽기 — 결제 플로우, 주문 테이블 구조, 환경변수 현황 파악
2. 기존 토스페이먼츠 연동 코드 위치 파악 (교체 대상)
3. Supabase Edge Function 디렉터리 위치 확인
4. 프로젝트 패키지 매니저 확인 (pnpm/npm/yarn)
5. `.env.example` 현황 확인

판단 요청 생기면 보고 후 대기. 사용자에게 직접 질문 X.

---

## §1 작업 범위

### 1-1. 환경변수 추가

`.env.local` 및 `.env.example` 에 아래 추가:

```
# 쿠키페이 (키움페이 기반)
VITE_COOKIEPAY_API_ID=           # 쿠키페이 연동 ID (클라이언트에서 결제창 호출용)
COOKIEPAY_API_KEY=               # 쿠키페이 시크릿 KEY (서버사이드 전용)
COOKIEPAY_SANDBOX=true           # true = 샌드박스, false = 라이브
```

- `VITE_COOKIEPAY_API_ID` 는 결제창 호출 시 클라이언트에서 사용 (공개값)
- `COOKIEPAY_API_KEY` 는 결제검증 API 호출 시 서버사이드 전용 (절대 클라이언트 노출 X)
- `COOKIEPAY_SANDBOX` 로 도메인 분기:
  - `true` → `https://sandbox.cookiepayments.com`
  - `false` → `https://www.cookiepayments.com`

Vercel 환경변수에도 동일하게 등록 (Production/Preview).

---

### 1-2. 쿠키페이 JS SDK 로드

`index.html` 에 jQuery + 쿠키페이 라이브러리 추가:

```html
<!-- jQuery (쿠키페이 SDK 의존성) -->
<script src="https://code.jquery.com/jquery-1.12.4.min.js"></script>
<!-- 쿠키페이 SDK (환경별 분기) -->
<!-- 샌드박스 -->
<script src="https://sandbox.cookiepayments.com/js/cookiepayments-1.1.4.js"></script>
<!-- 라이브 (배포 시 교체) -->
<!-- <script src="https://www.cookiepayments.com/js/cookiepayments-1.1.4.js"></script> -->
```

**주의:** 샌드박스/라이브 스크립트 URL을 동시에 로드하면 안 됨. 환경에 맞게 하나만 활성화.

TypeScript 타입 선언 추가 (`src/types/cookiepayments.d.ts`):

```typescript
interface CookiePaymentsInit {
  api_id: string;
}

interface CookiePaymentsRequest {
  ORDERNO: string;
  PRODUCTNAME: string;
  AMOUNT: number;
  BUYERNAME: string;
  BUYERPHONE?: string;
  PAYMETHOD?: 'CARD' | 'KAKAOPAY' | 'NAVERPAY';
  HOMEURL: string;
  CANCELURL?: string;
  MTYPE?: 'M';
  ETC1?: string;
  ETC2?: string;
  ETC3?: string;
}

interface CookiePayments {
  init: (config: CookiePaymentsInit) => void;
  payrequest: (params: CookiePaymentsRequest) => void;
}

declare const cookiepayments: CookiePayments;
```

---

### 1-3. 결제 유틸 함수 (`src/lib/cookiepay.ts`)

```typescript
// 쿠키페이 결제창 호출 유틸
// HOMEURL + MTYPE: 'M' 방식 — 팝업 없이 리다이렉트 (iOS Safari 팝업 차단 회피)

export function initCookiePay() {
  cookiepayments.init({
    api_id: import.meta.env.VITE_COOKIEPAY_API_ID,
  });
}

export interface CookiePayRequestParams {
  orderId: string;          // Supabase order UUID (ETC1에 박음)
  orderNo: string;          // 결제용 주문번호 (ORDERNO) — 유니크, 중복 불가
  productName: string;      // 상품명 (예: "설악무산문화축전 주문")
  amount: number;           // 결제 금액
  buyerPhone: string;       // 구매자 전화번호 (BUYERNAME + BUYERPHONE 동일값)
  payMethod?: 'CARD' | 'KAKAOPAY' | 'NAVERPAY';
}

export function requestCookiePay(params: CookiePayRequestParams) {
  const baseUrl = window.location.origin;

  cookiepayments.payrequest({
    ORDERNO: params.orderNo,
    PRODUCTNAME: params.productName,
    AMOUNT: params.amount,
    BUYERNAME: params.buyerPhone,   // 비회원 → 전화번호로 대체
    BUYERPHONE: params.buyerPhone,
    PAYMETHOD: params.payMethod ?? 'CARD',
    HOMEURL: `${baseUrl}/payment/complete`,   // 결제 완료 후 리다이렉트
    CANCELURL: `${baseUrl}/payment/cancel`,   // 결제 취소 시 리다이렉트
    MTYPE: 'M',                               // 모바일 웹뷰 방식 (팝업 X)
    ETC1: params.orderId,                     // Supabase order UUID — Noti 에서 활용
  });
}
```

---

### 1-4. 결제 완료 페이지 (`/payment/complete`)

HOMEURL 리다이렉트 도착 페이지. 암호화된 응답 복호화 후 주문 상태 업데이트.

**처리 흐름:**

```
1. URL 쿼리스트링에서 RESULTCODE, ENC_DATA 수신
2. RESULTCODE !== '0000' → 실패 처리 후 장바구니로 복귀
3. RESULTCODE === '0000' → 서버사이드 복호화 API 호출
4. 복호화 결과의 ORDERNO, AMOUNT 검증 (금액 위변조 확인)
5. Supabase orders 테이블 status = 'paid' 업데이트
6. /order/:id 로 리다이렉트
```

**복호화 API 연동** (`/api/cookiepay/decrypt`):

```typescript
// Vercel API Route: /api/cookiepay/decrypt.ts
// POST { API_ID, ENC_DATA } → 쿠키페이 복호화 API 호출 → 복호화된 결제 데이터 반환

const COOKIEPAY_DOMAIN = process.env.COOKIEPAY_SANDBOX === 'true'
  ? 'https://sandbox.cookiepayments.com'
  : 'https://www.cookiepayments.com';

// POST {요청도메인}/EdiAuth/cookiepay_edi_decrypt
// Header: ApiKey: {COOKIEPAY_API_KEY}
// Body: { API_ID, ENC_DATA }
```

---

### 1-5. 결제 취소 페이지 (`/payment/cancel`)

CANCELURL 도착 페이지. 결제 취소 시 안내 메시지 + 장바구니 복귀 버튼.

---

### 1-6. 결제검증 API (`/api/cookiepay/verify`)

복호화 후 금액 검증을 위한 서버사이드 API:

```
POST {요청도메인}/payAuth/token → TOKEN 발급
POST {요청도메인}/api/paycert (Header: TOKEN) → 결제 검증
```

검증 결과의 AMOUNT 와 Supabase orders 테이블의 total_amount 비교 — 불일치 시 주문 취소 처리.

---

### 1-7. Supabase Edge Function — Noti 수신 (`supabase/functions/cookiepay-noti`)

쿠키페이 서버 → Supabase Edge Function (Server to Server).

```typescript
// POST JSON 수신
// 결제 승인 Noti: PAY_METHOD, ORDERNO, AMOUNT, TID, ACCEPT_NO, ETC1(=orderId) 등
// 취소 Noti: noti_type = 'cancel', orderno, cancel_amount, tid 등

// 처리:
// 1. ORDERNO 또는 ETC1(orderId)로 Supabase orders 조회
// 2. 결제 승인 → status = 'paid', tid, accept_no 저장
// 3. 취소 → status = 'cancelled'
// 4. 응답: HTTP 200 OK
```

Edge Function 배포 후 URL을 쿠키페이 대시보드 → PG 설정 → 통지 URL 에 등록.

---

### 1-8. 기존 토스페이먼츠 코드 처리

- 토스페이먼츠 결제 호출 코드 → 쿠키페이로 교체
- 토스페이먼츠 환경변수는 `.env.example` 에 주석 처리 (삭제 X — 추후 복원 가능성)
- `VITE_TOSS_CLIENT_KEY` 관련 import/사용처 전부 제거

---

### 1-9. 결제 수단 선택 UI

CheckoutPage 결제 버튼 영역에 결제 수단 선택 추가:

- 카드결제 (CARD) — 기본값
- 카카오페이 (KAKAOPAY)
- 네이버페이 (NAVERPAY)

선택된 수단을 `requestCookiePay` 의 `payMethod` 로 전달.

---

## §2 금지 사항

- `COOKIEPAY_API_KEY` 를 클라이언트 코드에서 import/사용 절대 X
- `VITE_COOKIEPAY_API_ID` 를 서버사이드 API에서 시크릿처럼 사용 X (공개값)
- 팝업 방식(`window.open`) 사용 X — 반드시 `HOMEURL + MTYPE: 'M'` 리다이렉트 방식
- 결제 완료 처리를 HOMEURL 도착만으로 확정 X — 반드시 복호화 + 금액 검증 후 처리
- 샌드박스/라이브 스크립트 동시 로드 X
- jQuery를 React 컴포넌트 로직에서 직접 사용 X (쿠키페이 SDK 호출 전용)

---

## §3 착수 전 확정 사항

| 항목 | 확정값 |
|---|---|
| BUYERNAME | 구매자 전화번호 (비회원 식별용) |
| 결제창 방식 | HOMEURL + MTYPE: 'M' (리다이렉트, 팝업 X) |
| 초기 환경 | 샌드박스 (`sandbox.cookiepayments.com`) |
| orderId 전달 방식 | ETC1 에 Supabase order UUID 박음 |
| Noti 수신 위치 | Supabase Edge Function |
| 결제 수단 | CARD / KAKAOPAY / NAVERPAY |
| 복호화 위치 | Vercel API Route (서버사이드) |
| 토스페이먼츠 | 코드 교체, 환경변수 주석 처리 |

---

## §4 커밋 방식

작업 단위별 커밋:
- `feat: add cookiepay env and type declarations`
- `feat: add cookiepay JS SDK and utils`
- `feat: add payment complete/cancel pages`
- `feat: add cookiepay decrypt and verify API routes`
- `feat: add cookiepay noti edge function`
- `refactor: replace toss with cookiepay in checkout`
- `feat: add payment method selector UI`

`dev` 브랜치에서 작업. `main` push X.

---

## §5 핸드오프 예상 출력

작업 완료 후 핸드오프 문서에 아래 항목 업데이트:
- 쿠키페이 연동 현황 (샌드박스 연동 완료)
- 환경변수 목록 업데이트
- `/payment/complete`, `/payment/cancel` 라우트 추가 내역
- Edge Function URL (배포 후 확인)
- 토스페이먼츠 제거 내역

---

## §6 다음 블록 예고

이 구현 완료 후:
1. **검증 프롬프트** — 샌드박스 결제 E2E 테스트, Noti 수신 확인, 금액 검증 동작 확인
2. **쿠키페이 대시보드** — 통지 URL 등록 (사용자 직접)
3. **라이브 전환** — 환경변수 교체, 스크립트 URL 교체
