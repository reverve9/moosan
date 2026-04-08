import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PageTitle from '@/components/layout/PageTitle'
import Input from '@/components/ui/Input'
import { useCart, type CartItem } from '@/store/cartStore'
import { useToast } from '@/components/ui/Toast'
import { getTossPayments } from '@/lib/toss'
import { createPendingOrder } from '@/lib/orders'
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

/** 010-XXXX-XXXX 포맷으로 정리. 숫자만 남기고 11자리 기준 분할. */
function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 11)
  if (digits.length < 4) return digits
  if (digits.length < 8) return `${digits.slice(0, 3)}-${digits.slice(3)}`
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
}

const PHONE_RE = /^010-\d{4}-\d{4}$/

export default function CheckoutPage() {
  const navigate = useNavigate()
  const { items, totalAmount, totalCount } = useCart()
  const { showToast } = useToast()
  const [phone, setPhone] = useState('')
  const [touched, setTouched] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // 빈 장바구니면 카트로 돌려보냄
  useEffect(() => {
    if (items.length === 0) {
      navigate('/cart', { replace: true })
    }
  }, [items.length, navigate])

  const groups = useMemo(() => groupByBooth(items), [items])
  const phoneValid = PHONE_RE.test(phone)
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
      // 1) orders + order_items INSERT (status: pending)
      //    트리거가 order_number 자동 생성 → 토스 orderId 로 사용
      const order = await createPendingOrder({
        phone,
        totalAmount,
        items,
      })

      // 2) 토스 결제창 호출
      const tossPayments = await getTossPayments()
      const firstItem = items[0]
      const orderName =
        items.length === 1
          ? firstItem.menuName
          : `${firstItem.menuName} 외 ${items.length - 1}건`

      await tossPayments.requestPayment('카드', {
        amount: totalAmount,
        orderId: order.order_number,
        orderName,
        customerMobilePhone: phone.replace(/-/g, ''),
        successUrl: `${window.location.origin}/checkout/success`,
        failUrl: `${window.location.origin}/checkout/fail`,
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
