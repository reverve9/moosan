import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PageTitle from '@/components/layout/PageTitle'
import Input from '@/components/ui/Input'
import { useCart, type CartItem } from '@/store/cartStore'
import { useToast } from '@/components/ui/Toast'
import { getTossPayments } from '@/lib/toss'
import { createPendingPayment } from '@/lib/orders'
import { formatPhone, isValidPhone, saveLastPhone } from '@/lib/phone'
import {
  calcWaitingInfo,
  fetchBoothWaitingSummariesByIds,
  type BoothWaitingSummary,
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
  const [waitingSummaries, setWaitingSummaries] = useState<BoothWaitingSummary[]>([])

  // 빈 장바구니면 카트로 돌려보냄
  useEffect(() => {
    if (items.length === 0) {
      navigate('/cart', { replace: true })
    }
  }, [items.length, navigate])

  // 부스별 대기 요약 — mount 시 1회 fetch (cart 의 booth_id 들)
  useEffect(() => {
    const boothIds = Array.from(new Set(items.map((i) => i.boothId)))
    if (boothIds.length === 0) return
    let cancelled = false
    fetchBoothWaitingSummariesByIds(boothIds).then((data) => {
      if (!cancelled) setWaitingSummaries(data)
    })
    return () => {
      cancelled = true
    }
    // items 자체는 mount 후 변하지 않음 (cart 페이지에서 결정됨) — 길이만 의존
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length])

  const groups = useMemo(() => groupByBooth(items), [items])
  const phoneValid = isValidPhone(phone)
  const phoneError = touched && !phoneValid ? '올바른 휴대폰 번호를 입력해주세요' : undefined

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhone(formatPhone(e.target.value))
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
      // 1) payments + 부스별 orders + order_items INSERT (status: pending)
      //    - 트리거가 payments.toss_order_id 자동 채움 (전역 sequence)
      //    - 트리거가 orders.order_number 자동 채움 (부스별 누적)
      const { payment } = await createPendingPayment({
        phone,
        totalAmount,
        items,
      })

      // 결제 시도하는 phone 을 localStorage 에 저장 → /cart 의 주문 내역 섹션 auto-prefill
      saveLastPhone(phone)

      // 2) 토스 결제창 호출 (orderId = payments.toss_order_id)
      const tossPayments = await getTossPayments()
      const firstItem = items[0]
      const orderName =
        items.length === 1
          ? firstItem.menuName
          : `${firstItem.menuName} 외 ${items.length - 1}건`

      await tossPayments.requestPayment('카드', {
        amount: totalAmount,
        orderId: payment.toss_order_id,
        orderName,
        customerMobilePhone: phone.replace(/-/g, ''),
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
      </form>

      {/* ─── 부스별 대기 현황 (결제 직전) ─── */}
      {waitingSummaries.length > 0 && (
        <div className={styles.waitingBox}>
          <h3 className={styles.waitingTitle}>주문 매장 대기 현황</h3>
          <ul className={styles.waitingList}>
            {waitingSummaries.map((s) => {
              const info = calcWaitingInfo(s.count, s.avgPrepMinutes)
              const free = s.count === 0
              return (
                <li
                  key={s.boothId}
                  className={`${styles.waitingItem} ${free ? styles.waitingItemFree : ''}`}
                >
                  <span className={styles.waitingItemBooth}>{s.boothName}</span>
                  <span className={styles.waitingItemValue}>
                    {free ? '바로 준비' : `대기 ${s.count}건 · ${info.label}`}
                  </span>
                </li>
              )
            })}
          </ul>
          <p className={styles.waitingNote}>* 실제 시간은 다를 수 있어요</p>
        </div>
      )}

      {/* ─── Sticky 결제 바 ─── */}
      <div className={styles.checkoutBar}>
        <div className={styles.checkoutInner}>
          <div className={styles.checkoutTotal}>
            <span className={styles.totalLabel}>총 {totalCount}개 · 결제금액</span>
            <span className={styles.totalAmount}>
              {totalAmount.toLocaleString()}원
            </span>
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
