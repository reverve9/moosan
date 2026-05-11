/**
 * 솔라피 알림톡 발송 서버 라이브러리.
 *
 * - 별도 endpoint 가 아닌 라이브러리 — 다른 api/ route 가 import 해서 호출.
 *   외부 진입점 없음 = 호출 인증 문제 자체 소멸.
 * - DB 멱등성 (alimtalk_logs.idempotency_key UNIQUE) 으로 중복 발송 차단.
 * - 5xx/네트워크 에러만 1회 재시도, 4xx 즉시 fail.
 * - 알림톡 실패 시 SMS/LMS 자동 fallback (disableSms=false).
 * - 항상 내부 타입 AlimtalkResult 로 wrap — Solapi SDK raw response 노출 X.
 */

import { SolapiMessageService } from 'solapi'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { normalizePhone, isValidNormalizedPhone } from './phone'

// ─── Env warnings (모듈 로드 시 1회) ────────────────────────────────────────
if (!process.env.SOLAPI_API_KEY || !process.env.SOLAPI_API_SECRET
    || !process.env.KAKAO_SENDER || !process.env.KAKAO_PFID) {
  console.error('[alimtalk] core env not set (SOLAPI_API_KEY/SECRET, KAKAO_SENDER/PFID) — all sends will fail')
}
if (!process.env.KAKAO_TEMPLATE_PICKUP) {
  console.warn('[alimtalk] KAKAO_TEMPLATE_PICKUP not set — pickup alerts disabled (auto-skip)')
}
if (!process.env.KAKAO_TEMPLATE_REFUND) {
  console.warn('[alimtalk] KAKAO_TEMPLATE_REFUND not set — refund alerts disabled (검수중, auto-skip)')
}

// ─── Lazy singletons ────────────────────────────────────────────────────────
let _solapi: SolapiMessageService | null = null
function getSolapi(): SolapiMessageService | null {
  if (_solapi) return _solapi
  if (!process.env.SOLAPI_API_KEY || !process.env.SOLAPI_API_SECRET) return null
  _solapi = new SolapiMessageService(
    process.env.SOLAPI_API_KEY,
    process.env.SOLAPI_API_SECRET,
  )
  return _solapi
}

let _supabase: SupabaseClient | null = null
function getSupabase(): SupabaseClient | null {
  if (_supabase) return _supabase
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) return null
  _supabase = createClient(url, key)
  return _supabase
}

// ─── Types ──────────────────────────────────────────────────────────────────
type LogStatus =
  | 'sent'
  | 'fallback_lms'
  | 'failed'
  | 'failed_invalid_phone'
  | 'skipped_no_phone'
  | 'skipped_no_template'
  | 'duplicate'
  | 'pending'

export type AlimtalkResult = {
  ok: boolean
  status: LogStatus
  messageId?: string
  error?: string
}

type TemplateType = 'pickup' | 'refund'

type SendParams = {
  templateId: string | undefined
  phone: string | null | undefined
  variables: Record<string, string>
  idempotencyKey: string
  orderId: string
  boothId?: string
  templateType: TemplateType
}

const SEND_TIMEOUT_MS = 3000
const RETRY_BACKOFF_MS = 300

// ─── Helpers ────────────────────────────────────────────────────────────────
async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`alimtalk send timeout ${ms}ms`)), ms)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

function isRetriable(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as { statusCode?: number; status?: number; message?: string; errorCode?: string }
  const code = e.statusCode ?? e.status
  if (typeof code === 'number' && code >= 500 && code < 600) return true
  const msg = e.message ?? ''
  if (msg.includes('timeout') || msg.includes('ECONNRESET')
      || msg.includes('ETIMEDOUT') || msg.includes('fetch failed')
      || msg.includes('ENOTFOUND') || msg.includes('socket hang up')) {
    return true
  }
  return false
}

// Solapi 응답 분석 — alimtalk(ATA) 0건이고 SMS/LMS 발송됐으면 fallback.
function detectFallback(response: unknown): boolean {
  const r = response as { groupInfo?: { countForCharge?: { ata?: Record<string, number>; sms?: Record<string, number>; lms?: Record<string, number> } } }
  const charge = r?.groupInfo?.countForCharge
  if (!charge) return false
  const sumOf = (m: Record<string, number> | undefined) =>
    Object.values(m ?? {}).reduce((a, b) => a + b, 0)
  const ata = sumOf(charge.ata)
  const sms = sumOf(charge.sms) + sumOf(charge.lms)
  return ata === 0 && sms > 0
}

function extractMessageId(response: unknown): string | undefined {
  const r = response as { groupInfo?: { groupId?: string } }
  return r?.groupInfo?.groupId ?? undefined
}

async function resolveDisplayOrderNumber(
  supabase: SupabaseClient,
  orderId: string,
): Promise<string> {
  const { data } = await supabase
    .from('orders')
    .select('order_number')
    .eq('id', orderId)
    .single()
  return data?.order_number ?? orderId.slice(-6)
}

// ─── Core sender ────────────────────────────────────────────────────────────
async function _sendAlimtalk(p: SendParams): Promise<AlimtalkResult> {
  const supabase = getSupabase()
  if (!supabase) {
    console.error('[alimtalk] supabase env missing — cannot log')
    return { ok: false, status: 'failed', error: 'supabase env missing' }
  }

  const baseRow = {
    order_id: p.orderId,
    booth_id: p.boothId ?? null,
    template_type: p.templateType,
    idempotency_key: p.idempotencyKey,
  }

  // 1) 템플릿 미설정 → skip
  if (!p.templateId) {
    await supabase.from('alimtalk_logs').insert({
      ...baseRow,
      phone: normalizePhone(p.phone) || '',
      status: 'skipped_no_template',
    })
    return { ok: false, status: 'skipped_no_template' }
  }

  // 2) phone 없음 → skip
  if (!p.phone) {
    await supabase.from('alimtalk_logs').insert({
      ...baseRow,
      phone: '',
      status: 'skipped_no_phone',
    })
    return { ok: false, status: 'skipped_no_phone' }
  }

  // 3) phone 정규화 + 검증
  const normalized = normalizePhone(p.phone)
  if (!isValidNormalizedPhone(normalized)) {
    await supabase.from('alimtalk_logs').insert({
      ...baseRow,
      phone: normalized,
      status: 'failed_invalid_phone',
      error_message: `invalid phone format: ${p.phone}`,
    })
    return { ok: false, status: 'failed_invalid_phone', error: 'invalid_phone' }
  }

  // 4) idempotency INSERT (pending)
  const { data: inserted, error: insertErr } = await supabase
    .from('alimtalk_logs')
    .insert({
      ...baseRow,
      phone: normalized,
      status: 'pending',
      request_payload: { variables: p.variables },
    })
    .select('id')
    .single()

  if (insertErr) {
    // UNIQUE 위반 → 동일 키 이미 시도됨
    if (insertErr.code === '23505') {
      const { data: existing } = await supabase
        .from('alimtalk_logs')
        .select('status, solapi_message_id')
        .eq('idempotency_key', p.idempotencyKey)
        .single()
      if (existing?.status === 'sent' || existing?.status === 'fallback_lms') {
        return {
          ok: true,
          status: existing.status as LogStatus,
          messageId: existing.solapi_message_id ?? undefined,
        }
      }
      return {
        ok: false,
        status: 'duplicate',
        error: `already attempted with status=${existing?.status ?? 'unknown'}`,
      }
    }
    console.error('[alimtalk] log insert failed', insertErr)
    return { ok: false, status: 'failed', error: insertErr.message }
  }

  const logId = inserted!.id

  // 5) 솔라피 호출
  const solapi = getSolapi()
  if (!solapi) {
    await supabase.from('alimtalk_logs').update({
      status: 'failed',
      error_message: 'solapi env missing',
    }).eq('id', logId)
    return { ok: false, status: 'failed', error: 'solapi env missing' }
  }

  const message = {
    to: normalized,
    from: process.env.KAKAO_SENDER!,
    kakaoOptions: {
      pfId: process.env.KAKAO_PFID!,
      templateId: p.templateId,
      variables: p.variables,
      disableSms: false, // LMS/SMS fallback on
    },
  }

  const attempt = () => withTimeout(solapi.send(message), SEND_TIMEOUT_MS)

  let response: unknown = null
  let lastErr: unknown = null
  try {
    response = await attempt()
  } catch (err) {
    lastErr = err
    if (isRetriable(err)) {
      await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS))
      try {
        response = await attempt()
        lastErr = null
      } catch (err2) {
        lastErr = err2
      }
    }
  }

  if (lastErr) {
    const e = lastErr as { errorCode?: string; statusCode?: number; message?: string }
    await supabase.from('alimtalk_logs').update({
      status: 'failed',
      error_code: e.errorCode ?? (e.statusCode != null ? String(e.statusCode) : null),
      error_message: e.message ?? String(lastErr),
      response_payload: lastErr instanceof Error
        ? { name: lastErr.name, message: lastErr.message }
        : (lastErr as Record<string, unknown>),
    }).eq('id', logId)
    return { ok: false, status: 'failed', error: e.message ?? 'unknown' }
  }

  // 6) 성공
  const messageId = extractMessageId(response)
  const finalStatus: LogStatus = detectFallback(response) ? 'fallback_lms' : 'sent'

  await supabase.from('alimtalk_logs').update({
    status: finalStatus,
    solapi_message_id: messageId ?? null,
    response_payload: response as Record<string, unknown>,
    sent_at: new Date().toISOString(),
  }).eq('id', logId)

  return { ok: true, status: finalStatus, messageId }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * 픽업 (조리완료) 알림톡.
 * 부스마다 별도 발송 — idempotency key 에 boothId 포함.
 */
export async function sendPickupAlimtalk(
  orderId: string,
  phone: string | null | undefined,
  boothName: string,
  boothId?: string,
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

/**
 * 환불 알림톡.
 * orderId 로 orders.order_number 조회해 사람이 읽기 좋은 주문번호 노출.
 * 부스별 환불 금액으로 부스 단위 발송.
 */
export async function sendRefundAlimtalk(
  orderId: string,
  phone: string | null | undefined,
  refundAmount: number,
  boothId?: string,
): Promise<AlimtalkResult> {
  const supabase = getSupabase()
  const displayOrderNumber = supabase
    ? await resolveDisplayOrderNumber(supabase, orderId)
    : orderId.slice(-6)
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
