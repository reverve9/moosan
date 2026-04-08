import { loadTossPayments } from '@tosspayments/payment-sdk'

const CLIENT_KEY = import.meta.env.VITE_TOSS_CLIENT_KEY

if (!CLIENT_KEY) {
  // 빌드에는 통과시키되, 결제 호출 시점에 안내가 뜨도록 throw 는 미루기
  console.warn('[toss] VITE_TOSS_CLIENT_KEY is not set — 결제 호출 시 실패합니다')
}

let tossPaymentsPromise: ReturnType<typeof loadTossPayments> | null = null

/** 토스 SDK 인스턴스 (lazy 로드, 최초 1회만) */
export function getTossPayments() {
  if (!CLIENT_KEY) {
    throw new Error('VITE_TOSS_CLIENT_KEY is not configured')
  }
  if (!tossPaymentsPromise) {
    tossPaymentsPromise = loadTossPayments(CLIENT_KEY)
  }
  return tossPaymentsPromise
}

export interface ConfirmPaymentInput {
  paymentKey: string
  orderId: string
  amount: number
}

/** 서버사이드(/api/payments/confirm) 를 통한 결제 승인 호출 */
export async function confirmPayment(input: ConfirmPaymentInput) {
  const res = await fetch('/api/payments/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(data?.message || data?.error || '결제 승인에 실패했습니다')
  }
  return data
}
