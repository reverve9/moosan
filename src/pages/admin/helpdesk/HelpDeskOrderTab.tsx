import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { fetchFoodBooths } from '@/lib/festival'
import {
  fetchAvailableCouponsByPhone,
  validateCouponByCode,
  calcVoucherSettlement,
  VOUCHER_SOURCE_LABEL,
  type AvailableCouponOption,
} from '@/lib/coupons'
import { createPendingPayment, markPaymentPaid } from '@/lib/orders'
import { formatPhone, isValidPhone, normalizePhone } from '@/lib/phone'
import {
  fetchFoodCategories,
  getCategoryColorIndex,
  type FoodCategoryRow,
} from '@/lib/foodCategories'
import type { CartItem } from '@/store/cartStore'
import type { FoodBoothWithMenus, FoodMenu } from '@/types/festival_extras'
import type { PaymentMethod } from '@/types/database'
import styles from './AdminHelpDesk.module.css'

type CartLine = CartItem
type Method = 'cash' | 'external_card'

interface HelpDeskOrderTabProps {
  adminId: string
}

export default function HelpDeskOrderTab({ adminId }: HelpDeskOrderTabProps) {
  const [booths, setBooths] = useState<FoodBoothWithMenus[]>([])
  const [categories, setCategories] = useState<FoodCategoryRow[]>([])
  const [loading, setLoading] = useState(true)

  // 메뉴 필터 — 전체 매장 옵션을 없앴으므로 매장 선택 전까지는 메뉴 미노출.
  const [filterBoothId, setFilterBoothId] = useState<string>('')
  const [search, setSearch] = useState('')

  // 카트
  const [cart, setCart] = useState<CartLine[]>([])

  // 손님 정보
  const [phone, setPhone] = useState('')
  const phoneValid = isValidPhone(phone)

  // 쿠폰
  const [availableCoupons, setAvailableCoupons] = useState<AvailableCouponOption[]>([])
  const [selectedCouponId, setSelectedCouponId] = useState<string | 'none'>('none')

  // 결제 방식
  const [method, setMethod] = useState<Method>('cash')
  const [externalReceiptNo, setExternalReceiptNo] = useState('')
  const [memo, setMemo] = useState('')

  // 주류 동의
  const [alcoholChecked, setAlcoholChecked] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)

  // 초기 로드
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: festival } = await supabase
        .from('festivals')
        .select('id')
        .eq('slug', 'food')
        .single()
      if (!festival || cancelled) {
        setLoading(false)
        return
      }
      const [boothsData, categoriesData] = await Promise.all([
        fetchFoodBooths(festival.id),
        fetchFoodCategories().catch(() => [] as FoodCategoryRow[]),
      ])
      if (cancelled) return
      setBooths(boothsData.filter((b) => b.is_open && !b.is_paused))
      setCategories(categoriesData)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // 전화번호 변경 시 보유 쿠폰 조회
  useEffect(() => {
    if (!phoneValid) {
      setAvailableCoupons([])
      setSelectedCouponId('none')
      return
    }
    let cancelled = false
    fetchAvailableCouponsByPhone(normalizePhone(phone))
      .then((opts) => {
        if (!cancelled) setAvailableCoupons(opts)
      })
      .catch(() => {
        if (!cancelled) setAvailableCoupons([])
      })
    return () => {
      cancelled = true
    }
  }, [phone, phoneValid])

  const filteredMenus = useMemo(() => {
    const list: { booth: FoodBoothWithMenus; menu: FoodMenu }[] = []
    if (!filterBoothId) return list
    for (const b of booths) {
      if (b.id !== filterBoothId) continue
      for (const m of b.menus) {
        if (!m.is_active || m.price == null || m.price <= 0) continue
        if (search.trim().length > 0) {
          const q = search.trim().toLowerCase()
          if (
            !m.name.toLowerCase().includes(q) &&
            !b.name.toLowerCase().includes(q)
          ) continue
        }
        list.push({ booth: b, menu: m })
      }
    }
    return list
  }, [booths, filterBoothId, search])

  const subtotal = useMemo(
    () => cart.reduce((s, it) => s + it.price * it.quantity, 0),
    [cart],
  )
  const totalCount = useMemo(
    () => cart.reduce((s, it) => s + it.quantity, 0),
    [cart],
  )
  const hasAlcohol = useMemo(() => cart.some((i) => i.isAlcohol === true), [cart])

  // 부스별 그룹 (식권 분배 계산용)
  const groups = useMemo(() => {
    const map = new Map<string, { boothId: string; subtotal: number }>()
    for (const it of cart) {
      const cur = map.get(it.boothId)
      if (cur) cur.subtotal += it.price * it.quantity
      else map.set(it.boothId, { boothId: it.boothId, subtotal: it.price * it.quantity })
    }
    return Array.from(map.values())
  }, [cart])

  // 쿠폰 선택 결과 → 결제 금액 계산
  const selectedCoupon = useMemo<AvailableCouponOption | null>(() => {
    if (selectedCouponId === 'none') return null
    return availableCoupons.find((c) => c.couponId === selectedCouponId) ?? null
  }, [selectedCouponId, availableCoupons])

  const calc = useMemo(() => {
    if (!selectedCoupon) {
      return { discount: 0, voucherConsumed: 0, voucherBurned: 0, finalAmount: subtotal }
    }
    if (selectedCoupon.kind === 'discount') {
      if (subtotal < selectedCoupon.minOrderAmount) {
        return { discount: 0, voucherConsumed: 0, voucherBurned: 0, finalAmount: subtotal }
      }
      const discount = Math.min(selectedCoupon.discount, subtotal)
      return {
        discount,
        voucherConsumed: 0,
        voucherBurned: 0,
        finalAmount: Math.max(0, subtotal - discount),
      }
    }
    const settle = calcVoucherSettlement(groups, selectedCoupon.amount)
    return {
      discount: 0,
      voucherConsumed: settle.consumed,
      voucherBurned: settle.burned,
      finalAmount: settle.userPaid,
      distributions: settle.distributions,
    }
  }, [selectedCoupon, subtotal, groups])

  const finalAmount = calc.finalAmount

  // ─── 카트 조작 ───
  const addToCart = (booth: FoodBoothWithMenus, menu: FoodMenu) => {
    if (menu.price == null || menu.price <= 0) return
    setCart((prev) => {
      const found = prev.find((i) => i.menuId === menu.id)
      if (found) {
        return prev.map((i) =>
          i.menuId === menu.id ? { ...i, quantity: i.quantity + 1 } : i,
        )
      }
      return [
        ...prev,
        {
          menuId: menu.id,
          boothId: booth.id,
          boothNo: booth.booth_no ?? '',
          boothName: booth.name,
          menuName: menu.name,
          price: menu.price!,
          quantity: 1,
          imageUrl: menu.image_url ?? undefined,
          acceptsTakeout: menu.accepts_takeout ?? true,
          isTakeout: false,
          isAlcohol: menu.is_alcohol ?? false,
        },
      ]
    })
    setOkMsg(null)
    setError(null)
  }

  const updateQty = (menuId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((i) => (i.menuId === menuId ? { ...i, quantity: i.quantity + delta } : i))
        .filter((i) => i.quantity > 0),
    )
  }

  const removeLine = (menuId: string) => {
    setCart((prev) => prev.filter((i) => i.menuId !== menuId))
  }

  const resetAll = () => {
    setCart([])
    setPhone('')
    setExternalReceiptNo('')
    setMemo('')
    setSelectedCouponId('none')
    setAvailableCoupons([])
    setAlcoholChecked(false)
    setError(null)
  }

  // ─── 결제 처리 ───
  const handleSubmit = async () => {
    if (submitting) return
    if (cart.length === 0) {
      setError('카트가 비어있습니다')
      return
    }
    if (selectedCoupon && !phoneValid) {
      setError('쿠폰 사용 시 손님 휴대폰 번호를 입력하세요')
      return
    }
    if (method === 'external_card' && externalReceiptNo.trim().length === 0) {
      setError('직영카드 영수증 번호를 입력하세요')
      return
    }
    if (hasAlcohol && !alcoholChecked) {
      setError('주류 포함 주문 — 신분증 확인 체크 후 결제')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      // sold-out 재검증
      const menuIds = cart.map((i) => i.menuId)
      const { data: latestMenus, error: mErr } = await supabase
        .from('food_menus')
        .select('id, name, is_sold_out, is_active')
        .in('id', menuIds)
      if (mErr) throw new Error(`메뉴 상태 확인 실패: ${mErr.message}`)
      const blocked = (latestMenus ?? []).filter((m) => m.is_sold_out || !m.is_active)
      if (blocked.length > 0) {
        const names = blocked.map((m) => m.name).join(', ')
        throw new Error(`${names} — 품절된 메뉴가 있습니다`)
      }

      // 쿠폰 race 재검증
      let validatedCouponId: string | null = null
      let validatedDiscount = 0
      let validatedVoucherAmount = 0
      if (selectedCoupon) {
        const result = await validateCouponByCode(selectedCoupon.code, subtotal)
        if (!result.valid) throw new Error(result.error)
        validatedCouponId = result.couponId
        if (result.type === 'discount') validatedDiscount = result.discount
        else validatedVoucherAmount = result.voucherAmount
      }

      const isVoucher = !!selectedCoupon && selectedCoupon.kind === 'voucher'
      const settle = isVoucher
        ? calcVoucherSettlement(groups, validatedVoucherAmount)
        : null

      const userPaid = isVoucher
        ? settle!.userPaid
        : Math.max(0, subtotal - validatedDiscount)

      // method 자동 분기 — 식권 100% 결제 시 'voucher_only'
      const finalMethod: PaymentMethod = userPaid === 0 && isVoucher ? 'voucher_only' : method

      const consentAt = hasAlcohol ? new Date().toISOString() : null
      const usedPhone = phoneValid ? normalizePhone(phone) : ''

      const { payment } = await createPendingPayment({
        phone: usedPhone,
        totalAmount: userPaid,
        items: cart,
        couponId: validatedCouponId,
        discountAmount: isVoucher ? 0 : validatedDiscount,
        voucherDistributions: isVoucher
          ? settle!.distributions.map((d) => ({
              boothId: d.boothId,
              voucherConsumed: d.voucherConsumed,
              voucherBurned: d.voucherBurned,
            }))
          : undefined,
        alcoholConsentAt: consentAt,
        paymentMethod: finalMethod,
        assistedBy: adminId,
        externalReceiptNo: finalMethod === 'external_card' ? externalReceiptNo.trim() : null,
      })

      // memo 는 payment.meta 에 저장 (필요시)
      if (memo.trim().length > 0) {
        await supabase
          .from('payments')
          .update({ meta: { helper_memo: memo.trim() } })
          .eq('id', payment.id)
      }

      // 결제 완료 — Toss 우회. paymentKey=null 로 markPaymentPaid 호출.
      await markPaymentPaid(payment.id, null)

      setOkMsg(`결제 완료 (${userPaid.toLocaleString()}원). 부스에서 픽업 안내드리세요`)
      resetAll()
    } catch (e) {
      setError(e instanceof Error ? e.message : '결제 처리 실패')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <div className={styles.menuEmpty}>불러오는 중…</div>
  }

  return (
    <div className={styles.orderLayout}>
      {/* ── 좌측: 메뉴 ── */}
      <div className={styles.menuPane}>
        <div className={styles.menuFilters}>
          {booths.map((b) => {
            const active = filterBoothId === b.id
            const colorIdx = getCategoryColorIndex(b.category, categories)
            const colorClass = active
              ? (styles[`catColor${colorIdx}` as keyof typeof styles] ?? '')
              : ''
            return (
              <button
                key={b.id}
                type="button"
                className={`${styles.filterChip} ${active ? styles.filterChipOn : ''} ${colorClass}`}
                onClick={() => setFilterBoothId(active ? '' : b.id)}
              >
                {b.booth_no ? `${b.booth_no} ` : ''}{b.name}
              </button>
            )
          })}
        </div>

        <input
          type="text"
          className={styles.menuSearch}
          placeholder="메뉴/매장명 검색"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {!filterBoothId ? (
          <div className={styles.menuEmpty}>상단에서 매장을 선택하세요</div>
        ) : filteredMenus.length === 0 ? (
          <div className={styles.menuEmpty}>표시할 메뉴가 없습니다</div>
        ) : (
          <div className={styles.menuGrid}>
            {filteredMenus.map(({ booth, menu }) => (
              <button
                key={menu.id}
                type="button"
                className={styles.menuCard}
                onClick={() => addToCart(booth, menu)}
                disabled={menu.is_sold_out}
              >
                <span className={styles.menuCardBoothNo}>
                  {booth.booth_no ?? '—'} · {booth.name}
                </span>
                <span
                  className={`${styles.menuCardName} ${menu.is_alcohol ? styles.alcohol : ''}`}
                >
                  {menu.is_alcohol ? '🍺 ' : ''}{menu.name}
                </span>
                <span className={styles.menuCardPrice}>
                  {(menu.price ?? 0).toLocaleString()}원
                </span>
                {menu.is_sold_out && (
                  <span className={styles.menuCardSoldOut}>품절</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── 우측: 카트 ── */}
      <aside className={styles.cartPane}>
        <div className={styles.cartTitle}>
          장바구니 ({totalCount}개)
        </div>

        {cart.length === 0 ? (
          <div className={styles.cartEmpty}>좌측 메뉴를 클릭해 추가하세요</div>
        ) : (
          <ul className={styles.cartList}>
            {cart.map((line) => (
              <li key={line.menuId} className={styles.cartRow}>
                <span
                  className={`${styles.cartRowName} ${line.isAlcohol ? styles.alcohol : ''}`}
                >
                  {line.isAlcohol ? '🍺 ' : ''}{line.menuName}
                </span>
                <span className={styles.cartQtyGroup}>
                  <button
                    type="button"
                    className={styles.cartQtyBtn}
                    onClick={() => updateQty(line.menuId, -1)}
                  >
                    −
                  </button>
                  <span className={styles.cartQtyVal}>{line.quantity}</span>
                  <button
                    type="button"
                    className={styles.cartQtyBtn}
                    onClick={() => updateQty(line.menuId, +1)}
                  >
                    +
                  </button>
                </span>
                <span className={styles.cartRowPrice}>
                  {(line.price * line.quantity).toLocaleString()}
                </span>
                <button
                  type="button"
                  className={styles.cartRowRemove}
                  onClick={() => removeLine(line.menuId)}
                  aria-label="제거"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className={styles.cartDivider} />
        <div className={styles.cartSubtotalRow}>
          <span>합계</span>
          <span>{subtotal.toLocaleString()}원</span>
        </div>

        {/* 휴대폰 (쿠폰 사용 시 필수) */}
        <div className={styles.cartFieldGroup}>
          <span className={styles.cartFieldLabel}>휴대폰 번호 (쿠폰 사용 시 필수)</span>
          <input
            type="tel"
            inputMode="numeric"
            placeholder="010-0000-0000"
            className={styles.cartInput}
            value={phone}
            onChange={(e) => setPhone(formatPhone(e.target.value))}
          />
        </div>

        {/* 보유 쿠폰 */}
        {phoneValid && availableCoupons.length > 0 && (
          <div className={styles.cartFieldGroup}>
            <span className={styles.cartFieldLabel}>보유 쿠폰</span>
            <ul className={styles.cartCouponList}>
              {availableCoupons.map((c) => {
                const checked = selectedCouponId === c.couponId
                const disabled =
                  c.kind === 'discount' && subtotal < c.minOrderAmount
                return (
                  <li
                    key={c.couponId}
                    className={`${styles.cartCouponItem} ${checked ? styles.checked : ''} ${disabled ? styles.disabled : ''}`}
                    onClick={() => !disabled && setSelectedCouponId(c.couponId)}
                  >
                    <input
                      type="radio"
                      name="coupon"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => setSelectedCouponId(c.couponId)}
                    />
                    {c.kind === 'discount' ? (
                      <span>
                        할인쿠폰 -{c.discount.toLocaleString()}원
                        {c.minOrderAmount > 0 && ` (${c.minOrderAmount.toLocaleString()}원 이상)`}
                        {disabled && ' — 최소 주문액 미달'}
                      </span>
                    ) : (
                      <span>
                        식권 {c.amount.toLocaleString()}원 [{VOUCHER_SOURCE_LABEL[c.source]}] · {c.remainingCount}장
                      </span>
                    )}
                  </li>
                )
              })}
              <li
                className={`${styles.cartCouponItem} ${selectedCouponId === 'none' ? styles.checked : ''}`}
                onClick={() => setSelectedCouponId('none')}
              >
                <input
                  type="radio"
                  name="coupon"
                  checked={selectedCouponId === 'none'}
                  onChange={() => setSelectedCouponId('none')}
                />
                <span>사용 안 함</span>
              </li>
            </ul>
            {selectedCoupon?.kind === 'voucher' && calc.voucherBurned > 0 && (
              <span style={{ fontSize: 11, color: '#B45309', fontWeight: 600 }}>
                ※ 식권 잔액 {calc.voucherBurned.toLocaleString()}원 소멸
              </span>
            )}
          </div>
        )}

        {/* 결제 방식 */}
        <div className={styles.cartFieldGroup}>
          <span className={styles.cartFieldLabel}>결제 방식</span>
          <div className={styles.cartMethodGroup}>
            <button
              type="button"
              className={`${styles.cartMethodBtn} ${method === 'cash' ? styles.cartMethodBtnActive : ''}`}
              onClick={() => setMethod('cash')}
            >
              현금
            </button>
            <button
              type="button"
              className={`${styles.cartMethodBtn} ${method === 'external_card' ? styles.cartMethodBtnActive : ''}`}
              onClick={() => setMethod('external_card')}
            >
              직영카드
            </button>
          </div>
        </div>

        {method === 'external_card' && (
          <div className={styles.cartFieldGroup}>
            <span className={styles.cartFieldLabel}>영수증 번호 *</span>
            <input
              type="text"
              className={styles.cartInput}
              placeholder="단말기 영수증 번호"
              value={externalReceiptNo}
              onChange={(e) => setExternalReceiptNo(e.target.value)}
            />
          </div>
        )}

        <div className={styles.cartFieldGroup}>
          <span className={styles.cartFieldLabel}>메모 (옵션)</span>
          <textarea
            className={styles.cartTextarea}
            placeholder="자유 메모"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            rows={2}
          />
        </div>

        {/* 주류 동의 inline */}
        {hasAlcohol && (
          <div className={styles.cartAlcoholNotice}>
            <span className={styles.cartAlcoholNoticeTitle}>🍺 주류 포함 주문</span>
            <span>도우미가 손님 신분증을 직접 확인 후 결제하세요. 미성년자/신분증 미제시 시 주류는 환불됩니다.</span>
            <label className={styles.cartAlcoholConsent}>
              <input
                type="checkbox"
                checked={alcoholChecked}
                onChange={(e) => setAlcoholChecked(e.target.checked)}
              />
              <span>신분증 확인했습니다</span>
            </label>
          </div>
        )}

        {/* 받을 돈 */}
        <div className={styles.cartFinalRow}>
          <span>받을 돈</span>
          <span className={styles.cartFinalAmount}>{finalAmount.toLocaleString()}원</span>
        </div>

        {error && <div className={styles.cartError}>{error}</div>}
        {okMsg && <div style={{ fontSize: 12, color: '#16A34A', fontWeight: 600 }}>{okMsg}</div>}

        <button
          type="button"
          className={styles.cartSubmitBtn}
          onClick={handleSubmit}
          disabled={submitting || cart.length === 0 || (hasAlcohol && !alcoholChecked)}
        >
          {submitting ? '처리 중…' : '결제 완료'}
        </button>
      </aside>
    </div>
  )
}
