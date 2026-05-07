import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PageTitle from '@/components/layout/PageTitle'
import Input from '@/components/ui/Input'
import { useCart, type CartItem } from '@/store/cartStore'
import { useToast } from '@/components/ui/Toast'
import { supabase } from '@/lib/supabase'
import { getTossPayments } from '@/lib/toss'
import { createPendingPayment, markPaymentPaid } from '@/lib/orders'
import {
  fetchAvailableCouponsByPhone,
  validateCouponByCode,
  calcVoucherSettlement,
  VOUCHER_SOURCE_LABEL,
  type AvailableCouponOption,
} from '@/lib/coupons'
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

/** 라디오 키. 'none' 또는 옵션의 couponId */
type RadioKey = 'none' | string

function optionKey(opt: AvailableCouponOption): string {
  return opt.couponId
}

export default function CheckoutPage() {
  const navigate = useNavigate()
  const { items, totalAmount, totalCount, clear, boothTakeout } = useCart()
  const { showToast } = useToast()
  const [phone, setPhone] = useState('')
  const [touched, setTouched] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [waitingCounts, setWaitingCounts] = useState<Map<string, number>>(new Map())

  // ── 쿠폰 ──
  // 보유 쿠폰 (전화번호 → 자동 조회). 식권 + 할인쿠폰 통합.
  const [availableOptions, setAvailableOptions] = useState<AvailableCouponOption[]>([])
  // 수동 코드 입력으로 추가된 옵션 (1개) — 선택해도 자동 조회 결과와 통합 표시
  const [manualOption, setManualOption] = useState<AvailableCouponOption | null>(null)
  // 라디오 선택 — 'none' default (정책: 자동 추천 X)
  const [selectedKey, setSelectedKey] = useState<RadioKey>('none')

  // 수동 코드 입력 폼
  const [couponCode, setCouponCode] = useState('')
  const [couponError, setCouponError] = useState<string | null>(null)
  const [couponApplying, setCouponApplying] = useState(false)

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
  }, [items.length])

  const groups = useMemo(() => groupByBooth(items), [items])
  const phoneValid = isValidPhone(phone)
  const phoneError = touched && !phoneValid ? '올바른 휴대폰 번호를 입력해주세요' : undefined

  // 전화번호 11자리 완성 시 보유 쿠폰 일괄 조회
  useEffect(() => {
    if (!phoneValid) {
      setAvailableOptions([])
      setManualOption(null)
      setSelectedKey('none')
      return
    }
    let cancelled = false
    fetchAvailableCouponsByPhone(normalizePhone(phone))
      .then((opts) => {
        if (!cancelled) setAvailableOptions(opts)
      })
      .catch(() => {
        if (!cancelled) setAvailableOptions([])
      })
    return () => {
      cancelled = true
    }
  }, [phone, phoneValid])

  // 보유 + 수동 옵션 통합 (couponId 중복 제거 — 수동으로 입력한 코드가 마침 보유쿠폰일 수도 있음)
  const allOptions = useMemo<AvailableCouponOption[]>(() => {
    if (!manualOption) return availableOptions
    if (availableOptions.some((o) => o.couponId === manualOption.couponId)) {
      return availableOptions
    }
    return [...availableOptions, manualOption]
  }, [availableOptions, manualOption])

  const selectedOption = useMemo<AvailableCouponOption | null>(() => {
    if (selectedKey === 'none') return null
    return allOptions.find((o) => optionKey(o) === selectedKey) ?? null
  }, [allOptions, selectedKey])

  // 결제 금액 계산
  const calc = useMemo(() => {
    if (!selectedOption) {
      return { discount: 0, voucherConsumed: 0, voucherBurned: 0, finalAmount: totalAmount }
    }
    if (selectedOption.kind === 'discount') {
      // 최소 주문액 미달이면 적용 안 함 (UI 에서도 disabled 처리)
      if (totalAmount < selectedOption.minOrderAmount) {
        return { discount: 0, voucherConsumed: 0, voucherBurned: 0, finalAmount: totalAmount }
      }
      const discount = Math.min(selectedOption.discount, totalAmount)
      return {
        discount,
        voucherConsumed: 0,
        voucherBurned: 0,
        finalAmount: Math.max(0, totalAmount - discount),
      }
    }
    // voucher
    const settle = calcVoucherSettlement(
      groups.map((g) => ({ boothId: g.boothId, subtotal: g.subtotal })),
      selectedOption.amount,
    )
    return {
      discount: 0,
      voucherConsumed: settle.consumed,
      voucherBurned: settle.burned,
      finalAmount: settle.userPaid,
      distributions: settle.distributions,
    }
  }, [selectedOption, totalAmount, groups])

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhone(formatPhone(e.target.value))
  }

  const handleApplyManual = async () => {
    if (couponApplying) return
    const code = couponCode.trim()
    if (code.length === 0) return
    setCouponApplying(true)
    setCouponError(null)
    try {
      const result = await validateCouponByCode(code, totalAmount)
      if (!result.valid) {
        setCouponError(result.error)
        return
      }
      // 응답을 AvailableCouponOption 형태로 변환
      let opt: AvailableCouponOption
      if (result.type === 'discount') {
        opt = {
          kind: 'discount',
          couponId: result.couponId,
          code: result.code,
          discount: result.discount,
          // validate API 응답엔 minOrderAmount 가 직접 안 옴 — 검증이 통과한 상태라
          // 현재 totalAmount 로는 사용 가능. 하한선은 0 으로 두면 안전.
          minOrderAmount: 0,
        }
      } else {
        // 식권은 manual 입력 경로로 들어와도 single row — remainingCount=1
        opt = {
          kind: 'voucher',
          couponId: result.couponId,
          code: result.code,
          amount: result.voucherAmount,
          source: 'voucher_other',
          remainingCount: 1,
        }
      }
      setManualOption(opt)
      setSelectedKey(opt.couponId)
      setCouponCode('')
      showToast('쿠폰이 적용됐어요', { type: 'success' })
    } catch (e) {
      setCouponError(e instanceof Error ? e.message : '쿠폰 적용 실패')
    } finally {
      setCouponApplying(false)
    }
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
      // 0) sold-out 재검증
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

      // 1) 쿠폰 race 재검증 — 선택돼 있으면 결제 직전에 server-side 한 번 더
      let validatedCouponId: string | null = null
      let validatedDiscount = 0
      let validatedVoucherAmount = 0 // 식권 액면가
      if (selectedOption) {
        const code = selectedOption.code
        const result = await validateCouponByCode(code, totalAmount)
        if (!result.valid) {
          showToast(result.error, { type: 'error' })
          setSubmitting(false)
          return
        }
        validatedCouponId = result.couponId
        if (result.type === 'discount') {
          validatedDiscount = result.discount
        } else {
          validatedVoucherAmount = result.voucherAmount
        }
      }

      // 2) 식권 정산 분배 (선택된 게 식권일 때만)
      const isVoucher = !!selectedOption && selectedOption.kind === 'voucher'
      const settle = isVoucher
        ? calcVoucherSettlement(
            groups.map((g) => ({ boothId: g.boothId, subtotal: g.subtotal })),
            validatedVoucherAmount,
          )
        : null

      const finalAmount = isVoucher
        ? settle!.userPaid
        : Math.max(0, totalAmount - validatedDiscount)

      const normalizedPhone = normalizePhone(phone)

      // 3) payments + 부스별 orders + order_items INSERT (status: pending)
      const { payment } = await createPendingPayment({
        phone: normalizedPhone,
        totalAmount: finalAmount,
        items,
        couponId: validatedCouponId,
        discountAmount: isVoucher ? 0 : validatedDiscount,
        voucherDistributions: isVoucher
          ? settle!.distributions.map((d) => ({
              boothId: d.boothId,
              voucherConsumed: d.voucherConsumed,
              voucherBurned: d.voucherBurned,
            }))
          : undefined,
        isTakeoutByBooth: boothTakeout,
      })

      saveLastPhone(phone)

      // 4) 전액 식권 결제 (userPaid=0) — Toss 우회
      if (isVoucher && finalAmount === 0) {
        await markPaymentPaid(payment.id, null)
        clear()
        navigate(`/order/${payment.id}?from=checkout`, { replace: true })
        return
      }

      // 5) Toss 결제창 호출
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

        {/* ─── 보유 쿠폰 라디오 (전화번호 입력 후) ─── */}
        {phoneValid && allOptions.length > 0 && (
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>보유 쿠폰</h3>
            <ul className={styles.couponOptionList}>
              {allOptions.map((opt) => {
                const key = optionKey(opt)
                const checked = selectedKey === key
                if (opt.kind === 'discount') {
                  const disabled = totalAmount < opt.minOrderAmount
                  return (
                    <li
                      key={key}
                      className={`${styles.couponOption} ${checked ? styles.couponOptionChecked : ''} ${disabled ? styles.couponOptionDisabled : ''}`}
                    >
                      <label className={styles.couponLabel}>
                        <input
                          type="radio"
                          name="coupon"
                          value={key}
                          checked={checked}
                          disabled={disabled}
                          onChange={() => setSelectedKey(key)}
                        />
                        <span className={styles.couponLabelBody}>
                          <span className={styles.couponTitle}>
                            할인쿠폰 -{opt.discount.toLocaleString()}원
                          </span>
                          {opt.minOrderAmount > 0 && (
                            <span className={styles.couponMeta}>
                              {opt.minOrderAmount.toLocaleString()}원 이상 주문 시
                            </span>
                          )}
                          {disabled && (
                            <span className={styles.couponWarn}>
                              최소 주문액 미달
                            </span>
                          )}
                        </span>
                      </label>
                    </li>
                  )
                }
                return (
                  <li
                    key={key}
                    className={`${styles.couponOption} ${checked ? styles.couponOptionChecked : ''}`}
                  >
                    <label className={styles.couponLabel}>
                      <input
                        type="radio"
                        name="coupon"
                        value={key}
                        checked={checked}
                        onChange={() => setSelectedKey(key)}
                      />
                      <span className={styles.couponLabelBody}>
                        <span className={styles.couponTitle}>
                          식권 {opt.amount.toLocaleString()}원
                          <span className={styles.couponSourceTag}>
                            [{VOUCHER_SOURCE_LABEL[opt.source]}]
                          </span>
                        </span>
                        <span className={styles.couponMeta}>
                          남은 장수: {opt.remainingCount}장
                        </span>
                      </span>
                    </label>
                  </li>
                )
              })}
              <li
                className={`${styles.couponOption} ${selectedKey === 'none' ? styles.couponOptionChecked : ''}`}
              >
                <label className={styles.couponLabel}>
                  <input
                    type="radio"
                    name="coupon"
                    value="none"
                    checked={selectedKey === 'none'}
                    onChange={() => setSelectedKey('none')}
                  />
                  <span className={styles.couponLabelBody}>
                    <span className={styles.couponTitle}>사용 안 함</span>
                  </span>
                </label>
              </li>
            </ul>

            {/* 식권 잔액 소멸 안내 */}
            {selectedOption?.kind === 'voucher' && calc.voucherBurned > 0 && (
              <div className={styles.voucherBurnNotice}>
                ※ 식권 잔액 {calc.voucherBurned.toLocaleString()}원은 결제와 함께 소멸됩니다
              </div>
            )}
          </div>
        )}

        {/* ─── 쿠폰 (수동 코드 입력) ─── */}
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>쿠폰 코드 입력</h3>
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
              onClick={handleApplyManual}
              disabled={couponApplying || couponCode.trim().length === 0}
            >
              {couponApplying ? '확인 중…' : '적용'}
            </button>
          </div>
          {couponError && <div className={styles.couponError}>{couponError}</div>}
          <p className={styles.couponHint}>
            발급받은 코드를 직접 입력할 수 있어요
          </p>
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
            {(calc.discount > 0 || calc.voucherConsumed > 0) ? (
              <span className={styles.totalAmount}>
                <span className={styles.totalStrike}>
                  {totalAmount.toLocaleString()}원
                </span>{' '}
                {calc.finalAmount.toLocaleString()}원
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
            {submitting
              ? '결제창 여는 중…'
              : calc.finalAmount === 0 && selectedOption?.kind === 'voucher'
                ? '식권 결제하기'
                : '결제하기'}
          </button>
        </div>
      </div>
    </section>
  )
}
