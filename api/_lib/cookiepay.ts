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
