import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PageTitle from '@/components/layout/PageTitle'
import Input from '@/components/ui/Input'
import { useCart, type CartItem } from '@/store/cartStore'
import { useToast } from '@/components/ui/Toast'
import { supabase } from '@/lib/supabase'
import { getTossPayments } from '@/lib/toss'
import { createPendingPayment } from '@/lib/orders'
import { fetchAvailableCouponByPhone, validateCouponByCode } from '@/lib/coupons'
import type { Coupon } from '@/types/database'
import { formatPhone, isValidPhone, normalizePhone, saveLastPhone } from '@/lib/phone'
import {
  fetchAllBoothWaitingCounts,
  getBoothBadge,
} from '@/lib/waiting'
import styles from './CheckoutPage.module.css'

interface BoothGroup {
  boothId: string
  boothName: string
  items: CartItem[]
  subtotal: number
}

function groupByBooth(items: CartItem[]): BoothGroup[] {
  const map = new Map<string, BoothGroup>()
  for (const item of items) {
    const existing = map.get(item.boothId)
    if (existing) {
      existing.items.push(item)
      existing.subtotal += item.price * item.quantity
    } else {
      map.set(item.boothId, {
        boothId: item.boothId,
        boothName: item.boothName,
        items: [item],
        subtotal: item.price * item.quantity,
      })
    }
  }
  return Array.from(map.values())
}

export default function CheckoutPage() {
  const navigate = useNavigate()
  const { items, totalAmount, totalCount } = useCart()
  const { showToast } = useToast()
  const [phone, setPhone] = useState('')
  const [touched, setTouched] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [waitingCounts, setWaitingCounts] = useState<Map<string, number>>(new Map())
  // 쿠폰 — 수동 코드 입력 경로 (AdminCoupons 로 수동발급된 쿠폰용)
  const [couponCode, setCouponCode] = useState('')
  const [couponError, setCouponError] = useState<string | null>(null)
  const [couponApplying, setCouponApplying] = useState(false)
  const [appliedCoupon, setAppliedCoupon] = useState<
    { id: string; code: string; discount: number } | null
  >(null)
  // 전화번호 기반 자동 쿠폰 — 설문조사 자동발급분
  const [autoCoupon, setAutoCoupon] = useState<Coupon | null>(null)
  const [autoCouponDismissed, setAutoCouponDismissed] = useState(false)

  // 빈 장바구니면 카트로 돌려보냄
  useEffect(() => {
    if (items.length === 0) {
      navigate('/cart', { replace: true })
    }
  }, [items.length, navigate])

  // 부스별 대기 요약 — mount 시 1회 fetch
  useEffect(() => {
    if (items.length === 0) return
    let cancelled = false
    fetchAllBoothWaitingCounts().then((data) => {
      if (!cancelled) setWaitingCounts(data)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length])

  const groups = useMemo(() => groupByBooth(items), [items])
  const phoneValid = isValidPhone(phone)
  const phoneError = touched && !phoneValid ? '올바른 휴대폰 번호를 입력해주세요' : undefined

  // 전화번호 11자리 완성 시 자동 쿠폰 조회
  useEffect(() => {
    if (!phoneValid) {
      setAutoCoupon(null)
      setAutoCouponDismissed(false)
      return
    }
    let cancelled = false
    fetchAvailableCouponByPhone(normalizePhone(phone))
      .then((c) => {
        if (!cancelled) setAutoCoupon(c)
      })
      .catch(() => {
        // 자동 조회 실패는 조용히 무시 (수동 코드 입력 경로는 살아있음)
        if (!cancelled) setAutoCoupon(null)
      })
    return () => {
      cancelled = true
    }
  }, [phone, phoneValid])

  const discount = appliedCoupon?.discount ?? 0
  const finalAmount = Math.max(0, totalAmount - discount)

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhone(formatPhone(e.target.value))
  }

  const handleApplyCoupon = async () => {
    if (couponApplying) return
    const code = couponCode.trim()
    if (code.length === 0) return
    setCouponApplying(true)
    setCouponError(null)
    try {
      const result = await validateCouponByCode(code, totalAmount)
      if (!result.valid || !result.couponId) {
        setCouponError(result.error ?? '쿠폰 적용 실패')
        setAppliedCoupon(null)
        return
      }
      setAppliedCoupon({
        id: result.couponId,
        code: result.code ?? code.toUpperCase(),
        discount: result.discount ?? 0,
      })
      showToast('쿠폰이 적용됐어요', { type: 'success' })
    } catch (e) {
      setCouponError(e instanceof Error ? e.message : '쿠폰 적용 실패')
      setAppliedCoupon(null)
    } finally {
      setCouponApplying(false)
    }
  }

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null)
    setCouponCode('')
    setCouponError(null)
    // 자동 쿠폰을 해제한 경우 다시 카드로 제안하지 않도록 dismiss
    if (autoCoupon) setAutoCouponDismissed(true)
  }

  const handleApplyAutoCoupon = async () => {
    if (!autoCoupon || couponApplying) return
    setCouponApplying(true)
    setCouponError(null)
    try {
      // 서버 검증 재사용 (min_order_amount, status, expires_at)
      const result = await validateCouponByCode(autoCoupon.code, totalAmount)
      if (!result.valid || !result.couponId) {
        setCouponError(result.error ?? '쿠폰 적용 실패')
        return
      }
      setAppliedCoupon({
        id: result.couponId,
        code: result.code ?? autoCoupon.code,
        discount: result.discount ?? autoCoupon.discount_amount,
      })
      showToast('쿠폰이 적용됐어요', { type: 'success' })
    } catch (e) {
      setCouponError(e instanceof Error ? e.message : '쿠폰 적용 실패')
    } finally {
      setCouponApplying(false)
    }
  }

  const handleDismissAutoCoupon = () => {
    setAutoCouponDismissed(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setTouched(true)
    if (!phoneValid) {
      showToast('휴대폰 번호를 확인해주세요', { type: 'error' })
      return
    }
    if (submitting) return
    setSubmitting(true)

    try {
      // 0) sold-out 재검증 — Festival 페이지의 realtime 구독을 거치지 않고
      //    카트 진입(localStorage 복원, 다른 탭 등)한 케이스 안전망. 부스가
      //    품절 토글한 메뉴가 카트에 남아 있으면 결제 자체를 막는다.
      const menuIds = items.map((i) => i.menuId)
      const { data: latestMenus, error: menuErr } = await supabase
        .from('food_menus')
        .select('id, name, is_sold_out, is_active')
        .in('id', menuIds)
      if (menuErr) {
        throw new Error(`메뉴 상태 확인 실패: ${menuErr.message}`)
      }
      const blocked = (latestMenus ?? []).filter(
        (m) => m.is_sold_out || !m.is_active,
      )
      if (blocked.length > 0) {
        const names = blocked.map((m) => m.name).join(', ')
        showToast(`${names} — 품절된 메뉴가 있어 결제할 수 없어요`, {
          type: 'error',
          duration: 5000,
        })
        setSubmitting(false)
        return
      }

      // DB/API 저장용 — 하이픈 제거 (01012345678)
      const normalizedPhone = normalizePhone(phone)

      // 1) payments + 부스별 orders + order_items INSERT (status: pending)
      //    - 트리거가 payments.toss_order_id 자동 채움 (전역 sequence)
      //    - 트리거가 orders.order_number 자동 채움 (부스별 누적)
      //    - 쿠폰 적용 시 할인 후 금액을 total_amount 로 저장
      const { payment } = await createPendingPayment({
        phone: normalizedPhone,
        totalAmount: finalAmount,
        items,
        couponId: appliedCoupon?.id ?? null,
        discountAmount: discount,
      })

      // 결제 시도하는 phone 을 localStorage 에 저장 → /cart 의 주문 내역 섹션 auto-prefill
      // (UI 표시용이므로 포맷된 값 그대로)
      saveLastPhone(phone)

      // 2) 토스 결제창 호출 (orderId = payments.toss_order_id)
      const tossPayments = await getTossPayments()
      const firstItem = items[0]
      const orderName =
        items.length === 1
          ? firstItem.menuName
          : `${firstItem.menuName} 외 ${items.length - 1}건`

      await tossPayments.requestPayment('카드', {
        amount: finalAmount,
        orderId: payment.toss_order_id,
        orderName,
        customerMobilePhone: normalizedPhone,
        successUrl: `${window.location.origin}/checkout/success`,
        failUrl: `${window.location.origin}/checkout/fail`,
        windowTarget: 'self',
      })
      // 토스 결제창으로 리다이렉트되므로 아래 코드는 실행되지 않음
    } catch (err) {
      setSubmitting(false)
      const message = err instanceof Error ? err.message : '결제 호출 중 오류가 발생했습니다'
      // 토스 SDK 가 사용자 취소도 throw 하므로 메시지로 분기
      if (/취소/.test(message) || /USER_CANCEL/.test(message)) {
        showToast('결제를 취소했어요', { type: 'info' })
      } else {
        showToast(message, { type: 'error' })
      }
    }
  }

  if (items.length === 0) return null

  return (
    <section className={styles.page}>
      <PageTitle title="주문하기" />

      <form onSubmit={handleSubmit} className={styles.container}>
        {/* ─── 주문 요약 ─── */}
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>주문 내역</h3>
          <ul className={styles.boothList}>
            {groups.map((group) => (
              <li key={group.boothId} className={styles.boothGroup}>
                <div className={styles.boothHeader}>
                  <span className={styles.boothName}>{group.boothName}</span>
                  <span className={styles.boothSubtotal}>
                    {group.subtotal.toLocaleString()}원
                  </span>
                </div>
                <ul className={styles.itemList}>
                  {group.items.map((item) => (
                    <li key={item.menuId} className={styles.item}>
                      <span className={styles.itemName}>
                        {item.menuName}
                        <span className={styles.itemQty}> × {item.quantity}</span>
                      </span>
                      <span className={styles.itemPrice}>
                        {(item.price * item.quantity).toLocaleString()}원
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>

        {/* ─── 연락처 ─── */}
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>주문자 정보</h3>
          <Input
            label="휴대폰 번호"
            type="tel"
            inputMode="numeric"
            placeholder="010-0000-0000"
            value={phone}
            onChange={handlePhoneChange}
            onBlur={() => setTouched(true)}
            error={phoneError}
            hint="주문 상태 안내를 받을 번호입니다"
            required
            autoComplete="tel"
          />
        </div>

        {/* ─── 자동 쿠폰 카드 (전화번호 기반) ─── */}
        {phoneValid && !appliedCoupon && autoCoupon && !autoCouponDismissed && (
          <div className={styles.autoCouponCard}>
            <div className={styles.autoCouponIcon}>🎟</div>
            <div className={styles.autoCouponBody}>
              <div className={styles.autoCouponTitle}>
                {autoCoupon.discount_amount.toLocaleString()}원 할인 쿠폰
              </div>
              <div className={styles.autoCouponMeta}>
                {autoCoupon.min_order_amount.toLocaleString()}원 이상 주문 시 사용 가능
              </div>
              {totalAmount < autoCoupon.min_order_amount && (
                <div className={styles.autoCouponWarn}>
                  최소 주문액 미달 — {(autoCoupon.min_order_amount - totalAmount).toLocaleString()}원 부족
                </div>
              )}
            </div>
            <div className={styles.autoCouponActions}>
              <button
                type="button"
                className={styles.autoCouponApply}
                onClick={handleApplyAutoCoupon}
                disabled={
                  couponApplying || totalAmount < autoCoupon.min_order_amount
                }
              >
                {couponApplying ? '…' : '적용'}
              </button>
              <button
                type="button"
                className={styles.autoCouponDismiss}
                onClick={handleDismissAutoCoupon}
              >
                사용 안 함
              </button>
            </div>
          </div>
        )}

        {/* ─── 쿠폰 (수동 코드 입력) ─── */}
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>쿠폰</h3>
          {appliedCoupon ? (
            <div className={styles.couponApplied}>
              <div className={styles.couponAppliedLeft}>
                <span className={styles.couponAppliedCode}>{appliedCoupon.code}</span>
                <span className={styles.couponAppliedDiscount}>
                  -{appliedCoupon.discount.toLocaleString()}원
                </span>
              </div>
              <button
                type="button"
                className={styles.couponRemoveBtn}
                onClick={handleRemoveCoupon}
              >
                취소
              </button>
            </div>
          ) : (
            <>
              <div className={styles.couponInputRow}>
                <input
                  type="text"
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                  placeholder="예: MS-ABC123"
                  className={styles.couponInput}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                />
                <button
                  type="button"
                  className={styles.couponApplyBtn}
                  onClick={handleApplyCoupon}
                  disabled={couponApplying || couponCode.trim().length === 0}
                >
                  {couponApplying ? '확인 중…' : '적용'}
                </button>
              </div>
              {couponError && <div className={styles.couponError}>{couponError}</div>}
              <p className={styles.couponHint}>
                10,000원 이상 주문 시 사용 가능합니다
              </p>
            </>
          )}
        </div>
      </form>

      {/* ─── 부스별 대기 현황 (결제 직전) ─── */}
      {groups.length > 0 && (
        <div className={styles.waitingBox}>
          <h3 className={styles.waitingTitle}>주문 매장 대기 현황</h3>
          <ul className={styles.waitingList}>
            {groups.map((g) => {
              const count = waitingCounts.get(g.boothId) ?? 0
              const badge = getBoothBadge(count)
              return (
                <li
                  key={g.boothId}
                  className={`${styles.waitingItem} ${count === 0 ? styles.waitingItemFree : ''}`}
                >
                  <span className={styles.waitingItemBooth}>{g.boothName}</span>
                  <span className={styles.waitingItemValue}>
                    {count === 0 ? '바로 준비' : badge.label}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {/* ─── Sticky 결제 바 ─── */}
      <div className={styles.checkoutBar}>
        <div className={styles.checkoutInner}>
          <div className={styles.checkoutTotal}>
            <span className={styles.totalLabel}>총 {totalCount}개 · 결제금액</span>
            {discount > 0 ? (
              <span className={styles.totalAmount}>
                <span className={styles.totalStrike}>
                  {totalAmount.toLocaleString()}원
                </span>{' '}
                {finalAmount.toLocaleString()}원
              </span>
            ) : (
              <span className={styles.totalAmount}>
                {totalAmount.toLocaleString()}원
              </span>
            )}
          </div>
          <button
            type="button"
            className={styles.checkoutBtn}
            onClick={handleSubmit}
            disabled={!phoneValid || submitting}
          >
            {submitting ? '결제창 여는 중…' : '결제하기'}
          </button>
        </div>
      </div>
    </section>
  )
}
