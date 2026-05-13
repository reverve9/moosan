import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { parseOrderNumber } from '@/lib/orderNumber'
import styles from './DisplayPickup.module.css'

/**
 * 픽업 대기 디스플레이 페이지
 * URL: https://admin.musanfesta.com/display/pickup (또는 dev URL)
 * 캔버스: 1920x1080 고정 — 상단 720px 송출 영역 + 하단 360px 컨트롤 패널
 * 배경: 송출 영역 완전 투명 — OBS 수퍼소스 레이어 3 텍스트 전용
 *
 * 수퍼소스 구성 (참고):
 *   레이어 3 (최상단): 이 페이지 — 텍스트 전용
 *   레이어 2: 배경 이미지 (별도 준비, 오퍼시티 현장 조정)
 *   레이어 1: 메인 영상/중계 소스
 *
 * 하단 컨트롤 패널은 수퍼소스 크롭으로 송출에서 숨김 처리.
 *
 * 표시 조건: orders.ready_at IS NOT NULL AND picked_up_at IS NULL AND status != 'cancelled'
 * 제거: picked_up_at 채워지거나 status='cancelled' 로 변경되면 페이드아웃 후 제거.
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
  cardGap: number
}

const STORAGE_KEY = 'display_pickup_settings_v1'

const DEFAULT_SETTINGS: DisplaySettings = {
  orderFontSize: 80,
  orderColor: '#FFFFFF',
  boothFontSize: 20,
  boothColor: '#CCCCCC',
  cardGap: 24,
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

export default function DisplayPickup() {
  const [cards, setCards] = useState<PickupCard[]>([])
  const [removingIds, setRemovingIds] = useState<Set<string>>(() => new Set())
  const [settings, setSettings] = useState<DisplaySettings>(loadSettings)
  const testSeqRef = useRef(0)

  // localStorage 동기화
  useEffect(() => {
    saveSettings(settings)
  }, [settings])

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

  // Realtime — orders UPDATE 만 듣는다 (ready_at 채워지거나 picked_up_at 채워질 때).
  // INSERT 시점엔 ready_at 이 NULL 이라 표시 안 되므로 무시 가능.
  useEffect(() => {
    const channel = supabase
      .channel('display-pickup-orders')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders' },
        (payload) => {
          const o = payload.new as {
            id?: string
            order_number?: string
            booth_name?: string
            ready_at?: string | null
            picked_up_at?: string | null
            status?: string
          } | null
          if (!o?.id) return

          const shouldShow =
            !!o.ready_at && !o.picked_up_at && o.status !== 'cancelled'

          if (!shouldShow) {
            // 픽업 완료 / 취소 → 카드 제거 (애니메이션 후 unmount)
            setCards((prev) => {
              if (!prev.some((c) => c.orderId === o.id)) return prev
              setRemovingIds((r) => new Set([...r, o.id!]))
              window.setTimeout(() => {
                setCards((p) => p.filter((c) => c.orderId !== o.id))
                setRemovingIds((r) => {
                  const next = new Set(r)
                  next.delete(o.id!)
                  return next
                })
              }, 400)
              return prev
            })
            return
          }

          // ready_at 새로 채워짐 → 카드 추가 (중복 방지)
          setCards((prev) => {
            if (prev.some((c) => c.orderId === o.id)) return prev
            return [
              {
                orderId: o.id!,
                orderNumber: o.order_number ?? '',
                boothName: o.booth_name ?? '',
                readyAt: o.ready_at as string,
              },
              ...prev,
            ]
          })
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [])

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

  return (
    <div className={styles.root}>
      {/* 송출 영역 — OBS 캡처 대상 */}
      <section
        className={styles.broadcast}
        style={{ gap: `${settings.cardGap}px` } as React.CSSProperties}
      >
        {cards.map((card) => {
          const { counter } = parseOrderNumber(card.orderNumber)
          const removing = removingIds.has(card.orderId)
          return (
            <article
              key={card.orderId}
              className={`${styles.card} ${removing ? styles.cardRemoving : ''}`}
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
        })}
      </section>

      {/* 컨트롤 패널 — OBS 수퍼소스 크롭 밖 영역 */}
      <section className={styles.controls}>
        <header className={styles.controlsHeader}>
          <h2 className={styles.controlsTitle}>송출 컨트롤</h2>
          <span className={styles.controlsHint}>
            ↑ 상단 720px = 송출 영역 (수퍼소스 크롭) · 카드 {cards.length}건
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
