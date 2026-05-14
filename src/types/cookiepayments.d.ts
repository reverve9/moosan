interface CookiePaymentsInit {
  api_id: string
}

type CookiePayMethod = 'CARD' | 'KAKAOPAY' | 'NAVERPAY'

interface CookiePaymentsRequest {
  ORDERNO: string
  PRODUCTNAME: string
  AMOUNT: number
  BUYERNAME: string
  BUYERPHONE?: string
  BUYEREMAIL?: string
  PAYMETHOD?: CookiePayMethod
  RETURNURL?: string
  HOMEURL?: string
  CANCELURL?: string
  MTYPE?: 'M' | 'P'
  ETC1?: string
  ETC2?: string
  ETC3?: string
  ETC4?: string
  ETC5?: string
}

interface CookiePayments {
  init: (config: CookiePaymentsInit) => void
  payrequest: (params: CookiePaymentsRequest) => void
}

declare const cookiepayments: CookiePayments

interface Window {
  cookiepayments?: CookiePayments
}
