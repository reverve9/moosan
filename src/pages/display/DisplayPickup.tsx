import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { parseOrderNumber } from '@/lib/orderNumber'
import styles from './DisplayPickup.module.css'

/**
 * 픽업 대기 디스플레이 페이지
 * URL: https://admin.musanfesta.com/display/pickup
 * 캔버스: 1920x1080 고정 — 상단 720px 송출 영역 + 하단 360px 컨트롤 패널
 * 송출 영역 배경: 컨트롤로 조절 가능 (기본 opacity 0 = 투명, OBS 수퍼소스 호환)
 *
 * 표시 조건: orders.ready_at IS NOT NULL AND picked_up_at IS NULL AND status != 'cancelled'
 * 제거: picked_up_at 채워지거나 status='cancelled' 로 변경 → 페이드아웃 후 제거.
 *
 * N개 초과 시 자동 스크롤: 카드 합계 폭이 송출 영역 폭 초과 시 우→좌 무한 루프
 * (set 을 2회 렌더해 seamless loop). 단일 set fit 시엔 가운데 정렬 정적 표시.
 *
 * realtime: orders UPDATE 구독. payload.new 의 컬럼 누락(replica identity DEFAULT)
 * 대비해서 id 추출 후 supabase 에서 row 재조회 → 안정적인 메타 반영.
 */

interface PickupCard {
  orderId: string
  orderNumber: string
  boothName: string
  readyAt: string
}

interface DisplaySettings {
  orderFontSize: number
  orderColor: string
  boothFontSize: number
  boothColor: string
  cardGap: number     // 카드 간 간격
  nameGap: number     // 부스명 ↔ 주문번호 간격
  bgColor: string     // 송출 영역 배경 색상
  bgOpacity: number   // 0~100 (송출 영역 배경 투명도, 기본 0 = OBS 투명)
  bgImage: string     // 송출 영역 배경 이미지 URL (빈 문자열이면 미적용)
}

const STORAGE_KEY = 'display_pickup_settings_v1'

const DEFAULT_SETTINGS: DisplaySettings = {
  orderFontSize: 80,
  orderColor: '#FFFFFF',
  boothFontSize: 20,
  boothColor: '#CCCCCC',
  cardGap: 24,
  nameGap: 16,
  bgColor: '#000000',
  bgOpacity: 0,
  bgImage: '',
}

/** overflow 자동 스크롤 속도 (px/s). 한 set 가 다 흘러가는 시간 = setWidth / 이 값. */
const SCROLL_SPEED_PX_PER_SEC = 80

function loadSettings(): DisplaySettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_SETTINGS
    const parsed = JSON.parse(raw) as Partial<DisplaySettings>
    return { ...DEFAULT_SETTINGS, ...parsed }
  } catch {
    return DEFAULT_SETTINGS
  }
}

function saveSettings(s: DisplaySettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
  } catch {
    /* ignore */
  }
}

interface OrderRow {
  ready_at?: string | null
  picked_up_at?: string | null
  status?: string | null
}

function shouldDisplay(o: OrderRow): boolean {
  return !!o.ready_at && !o.picked_up_at && o.status !== 'cancelled'
}

export default function DisplayPickup() {
  const [cards, setCards] = useState<PickupCard[]>([])
  const [removingIds, setRemovingIds] = useState<Set<string>>(() => new Set())
  const [settings, setSettings] = useState<DisplaySettings>(loadSettings)
  const testSeqRef = useRef(0)

  // 스크롤 overflow 측정용 refs
  const containerRef = useRef<HTMLDivElement | null>(null)
  const setRef = useRef<HTMLDivElement | null>(null)
  const [overflowing, setOverflowing] = useState(false)
  const [setWidth, setSetWidth] = useState(0)

  // localStorage 동기화
  useEffect(() => {
    saveSettings(settings)
  }, [settings])

  // 카드 제거 (애니메이션 → unmount). picked_up / cancelled / row deleted 공통.
  const removeCard = useCallback((orderId: string) => {
    setCards((prev) => {
      if (!prev.some((c) => c.orderId === orderId)) return prev
      setRemovingIds((r) => new Set([...r, orderId]))
      window.setTimeout(() => {
        setCards((p) => p.filter((c) => c.orderId !== orderId))
        setRemovingIds((r) => {
          const next = new Set(r)
          next.delete(orderId)
          return next
        })
      }, 400)
      return prev
    })
  }, [])

  // 초기 로드 — 픽업 대기중인 주문 전체
  const fetchInitial = useCallback(async () => {
    const { data, error } = await supabase
      .from('orders')
      .select('id, order_number, booth_name, ready_at')
      .not('ready_at', 'is', null)
      .is('picked_up_at', null)
      .neq('status', 'cancelled')
      .order('ready_at', { ascending: false })
    if (error) {
      console.error('[DisplayPickup] initial fetch failed', error)
      return
    }
    if (!data) return
    setCards(
      data
        .filter((o) => !!o.ready_at)
        .map((o) => ({
          orderId: o.id,
          orderNumber: o.order_number,
          boothName: o.booth_name,
          readyAt: o.ready_at as string,
        })),
    )
  }, [])

  useEffect(() => {
    void fetchInitial()
  }, [fetchInitial])

  // Realtime — orders UPDATE 만 구독.
  // payload.new 가 replica identity DEFAULT 환경에서 변경된 컬럼만 담고 오는 케이스를
  // 방어하기 위해, 변경된 row id 만 빼서 supabase 에서 풀 row 재조회.
  useEffect(() => {
    const channel = supabase
      .channel('display-pickup-orders')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders' },
        (payload) => {
          const newRow = payload.new as { id?: string } | null
          const oldRow = payload.old as { id?: string } | null
          const id = newRow?.id ?? oldRow?.id
          if (!id) return

          void (async () => {
            const { data, error } = await supabase
              .from('orders')
              .select('id, order_number, booth_name, ready_at, picked_up_at, status')
              .eq('id', id)
              .maybeSingle()

            // row 가 없거나 오류 — 표시중이면 제거
            if (error || !data) {
              removeCard(id)
              return
            }

            if (!shouldDisplay(data)) {
              removeCard(id)
              return
            }

            // 표시 대상 — 카드 추가 또는 메타 업데이트
            setCards((prev) => {
              const existing = prev.find((c) => c.orderId === id)
              if (existing) {
                const newBoothName = data.booth_name ?? existing.boothName
                const newOrderNumber = data.order_number ?? existing.orderNumber
                if (
                  existing.boothName === newBoothName &&
                  existing.orderNumber === newOrderNumber
                ) {
                  return prev
                }
                return prev.map((c) =>
                  c.orderId === id
                    ? { ...c, boothName: newBoothName, orderNumber: newOrderNumber }
                    : c,
                )
              }
              return [
                {
                  orderId: id,
                  orderNumber: data.order_number ?? '',
                  boothName: data.booth_name ?? '',
                  readyAt: (data.ready_at as string) ?? new Date().toISOString(),
                },
                ...prev,
              ]
            })
          })()
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [removeCard])

  // 카드 개수·폭 변동 시 overflow 측정 — 자동 스크롤 on/off 결정
  useLayoutEffect(() => {
    const measure = () => {
      if (!containerRef.current || !setRef.current) return
      const cw = containerRef.current.clientWidth
      const sw = setRef.current.scrollWidth
      setSetWidth(sw)
      // +1 버퍼로 boundary oscillation 방지
      setOverflowing(sw > cw + 1)
    }
    measure()
    const ro = new ResizeObserver(measure)
    if (containerRef.current) ro.observe(containerRef.current)
    if (setRef.current) ro.observe(setRef.current)
    return () => ro.disconnect()
  }, [
    cards.length,
    settings.cardGap,
    settings.nameGap,
    settings.orderFontSize,
    settings.boothFontSize,
  ])

  // 테스트 카드 (로컬 가짜 데이터 — DB 영향 없음)
  const addTestCard = () => {
    testSeqRef.current += 1
    const seq = testSeqRef.current
    const fake = `T${String(seq).padStart(2, '0')}-${String(
      Math.floor(Math.random() * 9000) + 1000,
    )}`
    setCards((prev) => [
      {
        orderId: `test-${seq}`,
        orderNumber: fake,
        boothName: `테스트 매장 ${seq}`,
        readyAt: new Date().toISOString(),
      },
      ...prev,
    ])
  }

  const clearTestCards = () => {
    setCards((prev) => prev.filter((c) => !c.orderId.startsWith('test-')))
  }

  // 스크롤 거리 = 한 set 의 폭 + 마지막 card 다음의 gap (seamless loop)
  const scrollDistance = setWidth + settings.cardGap
  const scrollDuration =
    scrollDistance > 0 ? scrollDistance / SCROLL_SPEED_PX_PER_SEC : 30

  const renderCard = (card: PickupCard, dup = false) => {
    const { counter } = parseOrderNumber(card.orderNumber)
    const removing = removingIds.has(card.orderId)
    return (
      <article
        key={dup ? `${card.orderId}-dup` : card.orderId}
        className={`${styles.card} ${removing ? styles.cardRemoving : ''}`}
        style={{ gap: `${settings.nameGap}px` } as React.CSSProperties}
        aria-hidden={dup || undefined}
      >
        <div
          className={styles.booth}
          style={{
            fontSize: `${settings.boothFontSize}px`,
            color: settings.boothColor,
          }}
        >
          {card.boothName}
        </div>
        <div
          className={styles.order}
          style={{
            fontSize: `${settings.orderFontSize}px`,
            color: settings.orderColor,
          }}
        >
          {counter}
        </div>
      </article>
    )
  }

  return (
    <div className={styles.root}>
      {/* 송출 영역 — OBS 캡처 대상 */}
      <section ref={containerRef} className={styles.broadcast}>
        {/* 배경 layer — color + image + opacity. opacity 0 이면 OBS 송출용 투명 */}
        <div
          className={styles.broadcastBg}
          style={{
            backgroundColor: settings.bgColor,
            backgroundImage: settings.bgImage ? `url(${settings.bgImage})` : 'none',
            opacity: settings.bgOpacity / 100,
          }}
          aria-hidden
        />
        <div
          className={`${styles.track} ${overflowing ? styles.trackScroll : ''}`}
          style={
            {
              gap: `${settings.cardGap}px`,
              '--scroll-distance': `${scrollDistance}px`,
              '--scroll-duration': `${scrollDuration}s`,
            } as React.CSSProperties
          }
        >
          <div
            ref={setRef}
            className={styles.cardSet}
            style={{ gap: `${settings.cardGap}px` }}
          >
            {cards.map((c) => renderCard(c))}
          </div>
          {overflowing && (
            <div
              className={styles.cardSet}
              style={{ gap: `${settings.cardGap}px` }}
              aria-hidden
            >
              {cards.map((c) => renderCard(c, true))}
            </div>
          )}
        </div>
      </section>

      {/* 컨트롤 패널 — OBS 수퍼소스 크롭 밖 영역 */}
      <section className={styles.controls}>
        <header className={styles.controlsHeader}>
          <h2 className={styles.controlsTitle}>송출 컨트롤</h2>
          <span className={styles.controlsHint}>
            ↑ 상단 720px = 송출 영역 (수퍼소스 크롭) · 카드 {cards.length}건
            {overflowing && ' · 자동 스크롤'}
          </span>
        </header>

        <div className={styles.controlsGrid}>
          <label className={styles.control}>
            <span className={styles.controlLabel}>
              주문번호 크기 · {settings.orderFontSize}px
            </span>
            <input
              type="range"
              min={40}
              max={120}
              step={4}
              value={settings.orderFontSize}
              onChange={(e) =>
                setSettings((s) => ({ ...s, orderFontSize: Number(e.target.value) }))
              }
            />
          </label>

          <label className={styles.control}>
            <span className={styles.controlLabel}>주문번호 색상</span>
            <input
              type="color"
              value={settings.orderColor}
              onChange={(e) =>
                setSettings((s) => ({ ...s, orderColor: e.target.value }))
              }
            />
          </label>

          <label className={styles.control}>
            <span className={styles.controlLabel}>
              부스명 크기 · {settings.boothFontSize}px
            </span>
            <input
              type="range"
              min={14}
              max={36}
              step={1}
              value={settings.boothFontSize}
              onChange={(e) =>
                setSettings((s) => ({ ...s, boothFontSize: Number(e.target.value) }))
              }
            />
          </label>

          <label className={styles.control}>
            <span className={styles.controlLabel}>부스명 색상</span>
            <input
              type="color"
              value={settings.boothColor}
              onChange={(e) =>
                setSettings((s) => ({ ...s, boothColor: e.target.value }))
              }
            />
          </label>

          <label className={styles.control}>
            <span className={styles.controlLabel}>
              카드 간격 · {settings.cardGap}px
            </span>
            <input
              type="range"
              min={8}
              max={48}
              step={2}
              value={settings.cardGap}
              onChange={(e) =>
                setSettings((s) => ({ ...s, cardGap: Number(e.target.value) }))
              }
            />
          </label>

          <label className={styles.control}>
            <span className={styles.controlLabel}>
              부스명·번호 간격 · {settings.nameGap}px
            </span>
            <input
              type="range"
              min={0}
              max={48}
              step={2}
              value={settings.nameGap}
              onChange={(e) =>
                setSettings((s) => ({ ...s, nameGap: Number(e.target.value) }))
              }
            />
          </label>

          <label className={styles.control}>
            <span className={styles.controlLabel}>배경 색상</span>
            <input
              type="color"
              value={settings.bgColor}
              onChange={(e) =>
                setSettings((s) => ({ ...s, bgColor: e.target.value }))
              }
            />
          </label>

          <label className={styles.control}>
            <span className={styles.controlLabel}>
              배경 불투명도 · {settings.bgOpacity}%
            </span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={settings.bgOpacity}
              onChange={(e) =>
                setSettings((s) => ({ ...s, bgOpacity: Number(e.target.value) }))
              }
            />
          </label>

          <label className={`${styles.control} ${styles.controlWide}`}>
            <span className={styles.controlLabel}>배경 이미지 URL (선택)</span>
            <input
              type="text"
              value={settings.bgImage}
              placeholder="https://… 비워두면 미적용"
              spellCheck={false}
              autoComplete="off"
              className={styles.controlText}
              onChange={(e) =>
                setSettings((s) => ({ ...s, bgImage: e.target.value }))
              }
            />
          </label>

          <div className={styles.controlActions}>
            <button type="button" onClick={addTestCard} className={styles.btnTest}>
              테스트 카드 추가
            </button>
            <button type="button" onClick={clearTestCards} className={styles.btnClear}>
              테스트 카드 제거
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
