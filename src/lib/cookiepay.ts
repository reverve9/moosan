// 쿠키페이먼츠 결제창 호출 유틸.
// RETURNURL = Vercel API Route (/api/cookiepay/return). 결제 결과는 Form POST 로 전달되므로
// SPA 라우트가 아니라 서버 endpoint 가 받아서 복호화/검증/DB 업데이트 후 302 redirect.
// HOMEURL/CANCELURL 은 결제창 내부 "홈/취소" 버튼용 사용자 페이지.

const API_ID = import.meta.env.VITE_COOKIEPAY_API_ID

if (!API_ID) {
  console.warn(
    '[cookiepay] VITE_COOKIEPAY_API_ID is not set — 결제 호출 시 실패합니다',
  )
}

let initialized = false

function ensureInit() {
  if (!API_ID) {
    throw new Error('VITE_COOKIEPAY_API_ID is not configured')
  }
  if (typeof cookiepayments === 'undefined') {
    throw new Error(
      '쿠키페이 SDK 가 로드되지 않았습니다. index.html 스크립트 태그를 확인하세요.',
    )
  }
  if (!initialized) {
    cookiepayments.init({ api_id: API_ID })
    initialized = true
  }
}

export interface CookiePayRequestParams {
  orderId: string // Supabase payment.id (UUID) — ETC1 에 박아 Noti 에서 활용
  orderNo: string // 결제용 주문번호 (payments.toss_order_id, generic PG order ID)
  productName: string // 결제창 표시 상품명 (예: "메뉴명 외 N건")
  amount: number
  buyerPhone: string // BUYERNAME = BUYERPHONE (비회원 식별)
  payMethod?: CookiePayMethod
}

/** UA 기반 디바이스 분기 — MTYPE 'M'(모바일) / 'P'(PC). */
function detectMtype(): 'M' | 'P' {
  if (typeof navigator === 'undefined') return 'M'
  const ua = navigator.userAgent
  return /Mobi|Android|iPhone|iPad|iPod/i.test(ua) ? 'M' : 'P'
}

/**
 * RETURNURL/HOMEURL/CANCELURL 베이스. Vercel primary 가 www 라
 * apex(musanfesta.com) 호출 시 307 redirect → PG 클라이언트가 따라가지 않아
 * paid 전이 누락. 강제로 www. prefix 보장하여 redirect 우회.
 */
function buildPayBaseUrl(): string {
  const { protocol, host } = window.location
  // prod (musanfesta.com / www.musanfesta.com) 만 www 강제. localhost/vercel.app 등은 그대로.
  if (host === 'musanfesta.com') {
    return `${protocol}//www.musanfesta.com`
  }
  return `${protocol}//${host}`
}

export function requestCookiePay(params: CookiePayRequestParams) {
  ensureInit()
  const baseUrl = buildPayBaseUrl()
  const mtype = detectMtype()

  // PG 안내(2026-05-14 2차 답변): MTYPE='M' 일 때 RETURNURL 을 함께 보내면
  // 결제 완료 후 Form POST 자체가 발동되지 않음. 모바일은 RETURNURL 빼고 HOMEURL 만 보내라.
  // → 모바일은 HOMEURL 이 RETURNURL 역할 겸함 (PG 가 form POST 발송지로 사용).
  //   따라서 HOMEURL = server endpoint(/api/cookiepay/return) 로. SPA 라우트는 POST 못 받아 405.
  // → PC(='P') 는 기존대로 RETURNURL + HOMEURL=/cart.
  const payload: CookiePaymentsRequest = {
    ORDERNO: params.orderNo,
    PRODUCTNAME: params.productName,
    AMOUNT: params.amount,
    BUYERNAME: params.buyerPhone,
    BUYEREMAIL: 'noreply@musanfesta.com', // PG sample 상 필수. 영수증 발송 대상은 알림톡으로 별도 처리
    BUYERPHONE: params.buyerPhone,
    PAYMETHOD: params.payMethod ?? 'CARD',
    HOMEURL:
      mtype === 'M'
        ? `${baseUrl}/api/cookiepay/return`
        : `${baseUrl}/cart`,
    CANCELURL: `${baseUrl}/payment/cancel`,
    MTYPE: mtype,
    ETC1: params.orderId,
  }
  if (mtype === 'P') {
    payload.RETURNURL = `${baseUrl}/api/cookiepay/return`
  }

  cookiepayments.payrequest(payload)
}
