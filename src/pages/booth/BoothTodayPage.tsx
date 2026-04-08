import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowPathIcon,
  BanknotesIcon,
  ReceiptPercentIcon,
  ShoppingBagIcon,
} from '@heroicons/react/24/outline'
import { useBoothSession } from '@/components/booth/BoothLayout'
import { fetchTodayBoothOrderItems, type BoothOrderItem } from '@/lib/boothOrders'
import styles from './BoothTodayPage.module.css'

interface MenuRank {
  menuName: string
  quantity: number
  revenue: number
}

export default function BoothTodayPage() {
  const session = useBoothSession()
  const boothId = session.boothId

  const [items, setItems] = useState<BoothOrderItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const refetch = useCallback(async () => {
    try {
      const data = await fetchTodayBoothOrderItems(boothId)
      setItems(data)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : '데이터를 불러오지 못했습니다.')
    }
  }, [boothId])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    refetch().finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [refetch])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    await refetch()
    setRefreshing(false)
  }, [refetch])

  const totals = useMemo(() => {
    const revenue = items.reduce((sum, it) => sum + it.subtotal, 0)
    const orderCount = new Set(items.map((it) => it.order_id)).size
    const itemCount = items.reduce((sum, it) => sum + it.quantity, 0)
    return { revenue, orderCount, itemCount }
  }, [items])

  const menuRanks = useMemo<MenuRank[]>(() => {
    const map = new Map<string, MenuRank>()
    for (const it of items) {
      const prev = map.get(it.menu_name) ?? {
        menuName: it.menu_name,
        quantity: 0,
        revenue: 0,
      }
      prev.quantity += it.quantity
      prev.revenue += it.subtotal
      map.set(it.menu_name, prev)
    }
    return Array.from(map.values()).sort((a, b) => b.quantity - a.quantity)
  }, [items])

  const maxQty = menuRanks[0]?.quantity ?? 0

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div className={styles.headerLeft}>
          <h1 className={styles.pageTitle}>오늘 현황</h1>
          <p className={styles.pageSub}>오늘 결제 완료된 주문 기준</p>
        </div>
        <button
          type="button"
          className={styles.refreshBtn}
          onClick={handleRefresh}
          disabled={refreshing}
        >
          <ArrowPathIcon
            className={`${styles.refreshIcon} ${refreshing ? styles.refreshIconSpin : ''}`}
          />
          <span>새로고침</span>
        </button>
      </header>

      {error && <div className={styles.errorBanner}>{error}</div>}

      <section className={styles.summaryGrid}>
        <div className={styles.summaryCard}>
          <div className={styles.summaryIcon}>
            <BanknotesIcon />
          </div>
          <div className={styles.summaryLabel}>총 매출</div>
          <div className={styles.summaryValue}>
            {loading ? '—' : `${totals.revenue.toLocaleString()}원`}
          </div>
        </div>
        <div className={styles.summaryCard}>
          <div className={styles.summaryIcon}>
            <ReceiptPercentIcon />
          </div>
          <div className={styles.summaryLabel}>주문 건수</div>
          <div className={styles.summaryValue}>
            {loading ? '—' : `${totals.orderCount}건`}
          </div>
        </div>
        <div className={styles.summaryCard}>
          <div className={styles.summaryIcon}>
            <ShoppingBagIcon />
          </div>
          <div className={styles.summaryLabel}>판매 수량</div>
          <div className={styles.summaryValue}>
            {loading ? '—' : `${totals.itemCount}개`}
          </div>
        </div>
      </section>

      <section className={styles.rankSection}>
        <h2 className={styles.rankTitle}>메뉴별 판매 순위</h2>
        {loading ? (
          <div className={styles.empty}>집계 중...</div>
        ) : menuRanks.length === 0 ? (
          <div className={styles.empty}>오늘 판매된 메뉴가 없습니다.</div>
        ) : (
          <ol className={styles.rankList}>
            {menuRanks.map((rank, index) => {
              const widthPct = maxQty > 0 ? Math.max(8, (rank.quantity / maxQty) * 100) : 0
              return (
                <li key={rank.menuName} className={styles.rankRow}>
                  <span className={styles.rankNo}>{index + 1}</span>
                  <div className={styles.rankBody}>
                    <div className={styles.rankNameRow}>
                      <span className={styles.rankName}>{rank.menuName}</span>
                      <span className={styles.rankQty}>{rank.quantity}개</span>
                    </div>
                    <div className={styles.rankBarWrap}>
                      <div className={styles.rankBar} style={{ width: `${widthPct}%` }} />
                    </div>
                  </div>
                  <span className={styles.rankRevenue}>
                    {rank.revenue.toLocaleString()}원
                  </span>
                </li>
              )
            })}
          </ol>
        )}
      </section>
    </div>
  )
}
