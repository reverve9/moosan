// 쿠키페이먼츠 서버 라이브러리.
// - decryptEdi: RETURNURL 로 받은 ENC_DATA 복호화 (api/cookiepay/return 에서 호출)
// - refundPayment: Phase 4 에서 추가 예정 (TOKEN 발급 + /api/cancel)
//
// 환경변수 (server-only, VITE_ prefix 금지):
//   COOKIEPAY_API_KEY     — 복호화 API ApiKey 헤더
//   COOKIEPAY_PAY2_ID     — TOKEN 발급용 (Phase 4)
//   COOKIEPAY_PAY2_KEY    — TOKEN 발급용 (Phase 4)
//   COOKIEPAY_SANDBOX     — 'true' 면 sandbox, 그 외 라이브
//   VITE_COOKIEPAY_API_ID — API_ID (공개값이지만 서버에서도 사용)

function getBaseUrl(): string {
  return process.env.COOKIEPAY_SANDBOX === 'true'
    ? 'https://sandbox.cookiepayments.com'
    : 'https://www.cookiepayments.com'
}

export interface DecryptedPayment {
  RESULTCODE: string
  RESULTMSG?: string
  PAY_METHOD?: string // CARD / KAKAOPAY / NAVERPAY / BANK / VACCT
  ORDERNO?: string
  AMOUNT?: string | number
  TID?: string
  ACCEPT_NO?: string
  ACCEPT_DATE?: string
  BUYERNAME?: string
  BUYERPHONE?: string
  CARDCODE?: string
  CARDNAME?: string
  CARDNO?: string
  QUOTA?: string
  ETC1?: string
  ETC2?: string
  ETC3?: string
  ETC4?: string
  ETC5?: string
  [key: string]: unknown
}

interface DecryptResponse {
  RESULTCODE: string
  RESULTMSG?: string
  decryptData?: DecryptedPayment
}

/**
 * 쿠키페이 복호화 API 호출.
 * 입력: 결제창 RETURNURL 로 받은 ENC_DATA (암호화된 결제 결과 전문)
 * 출력: decryptData (ORDERNO/AMOUNT/TID/ACCEPT_NO/PAY_METHOD/ETC1 등)
 *
 * 호출처: api/cookiepay/return.ts (Form POST 수신 후 즉시)
 */
export async function decryptEdi(encData: string): Promise<DecryptResponse> {
  const apiId = process.env.VITE_COOKIEPAY_API_ID
  const apiKey = process.env.COOKIEPAY_API_KEY
  if (!apiId) throw new Error('VITE_COOKIEPAY_API_ID is not configured')
  if (!apiKey) throw new Error('COOKIEPAY_API_KEY is not configured')

  const url = `${getBaseUrl()}/EdiAuth/cookiepay_edi_decrypt`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      ApiKey: apiKey,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({ API_ID: apiId, ENC_DATA: encData }),
  })

  const data = (await res.json()) as DecryptResponse
  if (!res.ok) {
    throw new Error(
      `복호화 API HTTP ${res.status}: ${data?.RESULTMSG ?? 'unknown'}`,
    )
  }
  return data
}

/** PAY_METHOD 응답값을 우리 DB 저장 포맷(lowercase)으로 정규화 */
export function normalizePayMethod(
  payMethod: string | undefined,
): 'card' | 'kakaopay' | 'naverpay' | 'bank' | 'vacct' | 'mobile' | 'other' {
  switch ((payMethod ?? '').toUpperCase()) {
    case 'CARD':
      return 'card'
    case 'KAKAOPAY':
      return 'kakaopay'
    case 'NAVERPAY':
      return 'naverpay'
    case 'BANK':
      return 'bank'
    case 'VACCT':
      return 'vacct'
    case 'MOBILE':
      return 'mobile'
    default:
      return 'other'
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 환불 (Phase 4)
//
// 두 단계:
//   1) POST /payAuth/token — pay2_id/pay2_key 로 JWT 토큰 발급
//   2) POST /api/cancel — Authorization: TOKEN + ApiKey 헤더, body {tid, amount, reason}
//
// 매뉴얼 명시:
//   - CARD / 계좌이체만 환불 가능
//   - CARD 부분취소 지원 (인증/비인증 수기)
//   - KAKAOPAY/NAVERPAY 환불은 명시 없음 → B안 정책상 호출하지 않음 (수동 처리)
// ─────────────────────────────────────────────────────────────────────────────

interface TokenResponse {
  RESULTCODE?: string
  RESULTMSG?: string
  TOKEN?: string
}

let _tokenCache: { token: string; expiresAt: number } | null = null

/**
 * TOKEN 발급 (호출당 1회). 매뉴얼에 TTL 명시 없으므로 보수적으로 10분 캐시.
 * Vercel function instance 격리상 instance 별 캐시 — 실용상 환불 빈도 낮음.
 */
async function getCancelToken(): Promise<string> {
  const now = Date.now()
  if (_tokenCache && _tokenCache.expiresAt > now) {
    return _tokenCache.token
  }

  const pay2Id = process.env.COOKIEPAY_PAY2_ID
  const pay2Key = process.env.COOKIEPAY_PAY2_KEY
  if (!pay2Id || !pay2Key) {
    throw new Error('COOKIEPAY_PAY2_ID / COOKIEPAY_PAY2_KEY are not configured')
  }

  const url = `${getBaseUrl()}/payAuth/token`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ pay2_id: pay2Id, pay2_key: pay2Key }),
  })

  // 실제 응답 본문을 로그로 남겨 정확한 PG 응답 진단 (env 키 확인용)
  const rawText = await res.text()
  console.log('[cookiepay/token] response', {
    status: res.status,
    body: rawText.slice(0, 500),
    pay2IdPrefix: pay2Id.slice(0, 8),
  })

  let data: TokenResponse
  try {
    data = JSON.parse(rawText) as TokenResponse
  } catch {
    throw new Error(
      `TOKEN 발급 실패 (HTTP ${res.status}): 응답 JSON 파싱 실패 — ${rawText.slice(0, 200)}`,
    )
  }

  // TOKEN 또는 token (대소문자 양쪽 흡수)
  const token = data.TOKEN ?? (data as { token?: string }).token
  if (!res.ok || !token) {
    throw new Error(
      `TOKEN 발급 실패 (HTTP ${res.status}): ${data?.RESULTMSG ?? data?.RESULTCODE ?? 'no token'} — body: ${rawText.slice(0, 200)}`,
    )
  }

  _tokenCache = { token, expiresAt: now + 10 * 60 * 1000 }
  return token
}

export interface RefundRequest {
  tid: string
  amount?: number // 미지정 시 전체취소, 지정 시 부분취소
  reason: string
}

export interface RefundResponse {
  cancel_tid?: string
  cancel_code?: string
  cancel_msg?: string
  cancel_date?: string
  cancel_amt?: string | number
  [key: string]: unknown
}

/**
 * 쿠키페이 환불 호출.
 * 성공 = cancel_code === '0000'. 그 외는 throw.
 */
export async function refundCookiePayment(
  req: RefundRequest,
): Promise<RefundResponse> {
  const apiKey = process.env.COOKIEPAY_API_KEY
  if (!apiKey) throw new Error('COOKIEPAY_API_KEY is not configured')

  const token = await getCancelToken()
  const url = `${getBaseUrl()}/api/cancel`

  const body: Record<string, unknown> = {
    tid: req.tid,
    reason: req.reason,
  }
  if (req.amount !== undefined) body.amount = req.amount

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      TOKEN: token,
      ApiKey: apiKey,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(body),
  })

  const data = (await res.json()) as RefundResponse
  if (!res.ok) {
    throw new Error(
      `환불 API HTTP ${res.status}: ${data?.cancel_msg ?? 'unknown'}`,
    )
  }
  if (data.cancel_code !== '0000') {
    throw new Error(
      `환불 실패 (${data.cancel_code}): ${data.cancel_msg ?? 'unknown'}`,
    )
  }
  return data
}

/**
 * 결제수단별 자동 환불 가능 여부.
 * - card / bank / kakaopay / naverpay: 자동 환불 (쿠키페이 /api/cancel 호출)
 *   (카카오/네이버페이도 쿠키페이 확인상 동일 환불 API 처리 가능 — 2026-05-12)
 * - vacct / mobile / other: 매뉴얼 미보장 — 보수적으로 수동 처리
 */
export function isPgMethodAutoRefundable(
  pgMethod: string | null | undefined,
): boolean {
  if (!pgMethod) return false
  return (
    pgMethod === 'card' ||
    pgMethod === 'bank' ||
    pgMethod === 'kakaopay' ||
    pgMethod === 'naverpay'
  )
}
