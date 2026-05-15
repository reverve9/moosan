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
  scrollSpeed: number // overflow 자동 스크롤 속도 (px/s)
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
  scrollSpeed: 80,
}

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
  const trackRef = useRef<HTMLDivElement | null>(null)
  const offsetRef = useRef(0)
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

  // Realtime — orders UPDATE 구독 + 현장 송출 안전망.
  // 안전망 3종 (블랙매직 슈퍼소스/OBS 등 장시간 송출 환경 대비):
  //   1) .subscribe(status) — CHANNEL_ERROR/TIMED_OUT/CLOSED 콘솔 진단
  //   2) visibilitychange 시 채널 재구독 + 즉시 refetch — stale websocket 복구
  //   3) 30s 주기 fallback fetchInitial — 이벤트 단발 누락 시 자가복구
  // payload.new 가 replica identity DEFAULT 환경에서 변경된 컬럼만 담고 오는 케이스를
  // 방어하기 위해, 변경된 row id 만 빼서 supabase 에서 풀 row 재조회.
  useEffect(() => {
    const handlePayload = (payload: {
      eventType?: string
      new: Record<string, unknown> | null
      old: Record<string, unknown> | null
    }) => {
      const newRow = payload.new as { id?: string } | null
      const oldRow = payload.old as { id?: string } | null
      const id = newRow?.id ?? oldRow?.id
      console.log('[DisplayPickup] payload', payload.eventType, id, {
        ready_at: (newRow as { ready_at?: unknown })?.ready_at,
        picked_up_at: (newRow as { picked_up_at?: unknown })?.picked_up_at,
        status: (newRow as { status?: unknown })?.status,
      })
      if (!id) return

      void (async () => {
        const { data, error } = await supabase
          .from('orders')
          .select('id, order_number, booth_name, ready_at, picked_up_at, status')
          .eq('id', id)
          .maybeSingle()

        console.log('[DisplayPickup] refetch', id, {
          err: error?.message,
          ready_at: data?.ready_at,
          picked_up_at: data?.picked_up_at,
          status: data?.status,
        })

        if (error || !data) {
          removeCard(id)
          return
        }

        if (!shouldDisplay(data)) {
          console.log('[DisplayPickup] skip — not display target', id)
          removeCard(id)
          return
        }

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
    }

    const buildChannel = (tag: string) =>
      supabase
        .channel('display-pickup-orders')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'orders' },
          handlePayload,
        )
        .subscribe((status, err) => {
          console.log(`[DisplayPickup] realtime ${tag}`, status, err ?? '')
        })

    let channel = buildChannel('init')

    // 30s fallback — realtime 누락 시 최대 30s 지연으로 자가복구
    const interval = window.setInterval(() => {
      void fetchInitial()
    }, 30_000)

    // 탭/창 복귀 시 — 끊겼을 수 있는 socket 재구독 + 즉시 refetch
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return
      void fetchInitial()
      void supabase.removeChannel(channel)
      channel = buildChannel('revisit')
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.clearInterval(interval)
      void supabase.removeChannel(channel)
    }
  }, [removeCard, fetchInitial])

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

  // RAF 기반 무한 스크롤 — translateX 를 직접 제어해 끝→처음 wrap 을 한 frame 에 처리.
  // wrap 폭 = set 1개 폭 + track gap (set1 끝 → set2 첫 카드 거리). 이 만큼 흐른 뒤
  // 그 값을 빼면 화면상 set1 첫 카드 위치 = set2 첫 카드 위치라 시각적 점프가 없다.
  useEffect(() => {
    const node = trackRef.current
    if (!node) return
    if (!overflowing || setWidth <= 0) {
      offsetRef.current = 0
      node.style.transform = 'translateX(0px)'
      return
    }
    const wrap = setWidth + settings.cardGap
    // 카드 수/폭이 줄어 현재 offset 이 wrap 을 넘는 경우 정규화
    if (offsetRef.current >= wrap) offsetRef.current %= wrap
    let last = performance.now()
    let rafId = 0
    const tick = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      let next = offsetRef.current + settings.scrollSpeed * dt
      if (next >= wrap) next -= wrap
      offsetRef.current = next
      node.style.transform = `translateX(-${next}px)`
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [overflowing, setWidth, settings.cardGap, settings.scrollSpeed])

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
          ref={trackRef}
          className={`${styles.track} ${overflowing ? styles.trackScroll : ''}`}
          style={{ gap: `${settings.cardGap}px` }}
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
            <span className={styles.controlLabel}>
              스크롤 속도 · {settings.scrollSpeed}px/s
            </span>
            <input
              type="range"
              min={20}
              max={300}
              step={10}
              value={settings.scrollSpeed}
              onChange={(e) =>
                setSettings((s) => ({ ...s, scrollSpeed: Number(e.target.value) }))
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
