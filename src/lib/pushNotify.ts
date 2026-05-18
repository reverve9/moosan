/**
 * Web Push 클라이언트 헬퍼.
 *
 * 사용
 *  - registerBoothPush(boothId)  : 부스 대시보드 진입 시 1회 호출.
 *                                  Notification 권한 요청 → SW subscribe →
 *                                  /api/push/subscribe POST.
 *  - notifyBoothPaid(boothId, …) : 헬프데스크 결제 paid 직후 1회 호출.
 *                                  /api/push/notify-booth POST.
 *
 * 정책
 *  - 미지원 환경 / 권한 거부 → 조용히 무시 (호출부 try/catch 불필요)
 *  - 권한 'default' 이면 자동 prompt — 부스 직원이 알람 받으려면 허용 필수
 *  - 권한 'denied' 이면 OS 설정 안내 (UI 단에서 별도 표시 가능)
 */

import { supabase } from './supabase'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

function urlBase64ToBuffer(base64: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b)
  const buf = new ArrayBuffer(raw.length)
  const view = new Uint8Array(buf)
  for (let i = 0; i < raw.length; i += 1) view[i] = raw.charCodeAt(i)
  return buf
}

export type RegisterResult =
  | { ok: true }
  | { ok: false; reason: 'unsupported' | 'denied' | 'no_vapid' | 'error'; detail?: string }

export async function registerBoothPush(boothId: string): Promise<RegisterResult> {
  if (typeof window === 'undefined') return { ok: false, reason: 'unsupported' }
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return { ok: false, reason: 'unsupported' }
  }
  if (!VAPID_PUBLIC_KEY) {
    return { ok: false, reason: 'no_vapid' }
  }
  try {
    let perm = Notification.permission
    if (perm === 'default') {
      perm = await Notification.requestPermission()
    }
    if (perm !== 'granted') {
      return { ok: false, reason: 'denied' }
    }

    const reg = await navigator.serviceWorker.ready
    const existing = await reg.pushManager.getSubscription()
    const sub =
      existing ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToBuffer(VAPID_PUBLIC_KEY),
      }))
    const json = sub.toJSON() as {
      endpoint?: string
      keys?: { p256dh?: string; auth?: string }
    }

    const r = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        boothId,
        subscription: json,
        userAgent: navigator.userAgent,
      }),
    })
    if (!r.ok) {
      return { ok: false, reason: 'error', detail: `subscribe http ${r.status}` }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: 'error', detail: e instanceof Error ? e.message : String(e) }
  }
}

export interface NotifyPayload {
  title?: string
  body?: string
  tag?: string
  url?: string
  /** 단일 주문 식별자. alarmEngine 의 dedup key 로 사용되어 realtime+push
   *  중복 알람을 1회로 합침. 한 booth 에 여러 주문이면 첫 orderId 전달. */
  orderId?: string
}

/**
 * 부스에 새 paid 주문 알림 푸시. fire-and-forget — 실패는 silent.
 */
export function notifyBoothPaid(boothId: string, payload?: NotifyPayload): void {
  if (typeof window === 'undefined') return
  void fetch('/api/push/notify-booth', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ boothId, payload }),
  }).catch(() => {
    /* 무시 — 결제 완료 자체에 영향 주지 않게 */
  })
}

/**
 * 결제ID 의 paid 부스들에 푸시 발송. paid 전이 직후 호출.
 * fire-and-forget — 실패는 silent.
 *
 * 호출 시점은 markPaymentPaid 직후 — 그 시점 supabase 에서 orders 조회로
 * booth_ids 산출. 중복 boothId 는 dedup. 한 booth 에 여러 주문이면 첫 orderId
 * 를 payload.orderId 로 전달 (alarmEngine dedup key).
 */
export async function notifyBoothsForPayment(paymentId: string): Promise<void> {
  if (typeof window === 'undefined') return
  try {
    const { data } = await supabase
      .from('orders')
      .select('id, booth_id')
      .eq('payment_id', paymentId)
      .eq('status', 'paid')
    const firstOrderIdByBooth = new Map<string, string>()
    for (const o of data ?? []) {
      if (!o.booth_id || !o.id) continue
      if (!firstOrderIdByBooth.has(o.booth_id)) {
        firstOrderIdByBooth.set(o.booth_id, o.id)
      }
    }
    for (const [bid, orderId] of firstOrderIdByBooth) {
      notifyBoothPaid(bid, { orderId })
    }
  } catch {
    /* 무시 */
  }
}
