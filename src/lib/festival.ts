import { supabase } from './supabase'
import type { Festival, Program } from '@/types/database'
import type {
  FestivalEvent,
  FestivalGuest,
  FoodBooth,
  FoodBoothWithMenus,
  FoodMenu,
} from '@/types/festival_extras'

const STORAGE_BUCKET = 'festival-assets'

/**
 * Storage path 또는 정적/외부 경로 → 사용 가능한 URL
 *
 * 케이스
 *  · 'festivals/youth/poster.png' → supabase storage public URL
 *  · '/images/thumb_xxx.png'      → 정적 public 경로 그대로 반환 (시드 데이터 호환)
 *  · 'https://...'                → 외부 URL 그대로 반환
 */
export function getAssetUrl(path: string | null | undefined): string | null {
  if (!path) return null
  if (path.startsWith('/') || path.startsWith('http://') || path.startsWith('https://')) {
    return path
  }
  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path)
  return data.publicUrl
}

/**
 * 현재 창 origin 에서 admin/booth subdomain 을 제거한 customer origin 반환.
 * 도메인 모드 분리(admin.musanfesta.com / booth.musanfesta.com / musanfesta.com)
 * 환경에서 어드민이 생성한 QR 링크가 customer 도메인을 가리키도록 강제한다.
 *
 *  · admin.musanfesta.com   → https://musanfesta.com
 *  · booth.localhost:5173   → http://localhost:5173
 *  · x-admin.example.com    → https://example.com
 */
export function getCustomerOrigin(): string {
  if (typeof window === 'undefined') return ''
  const { protocol, hostname, port } = window.location
  const customerHost = hostname
    .replace(/^admin\./, '')
    .replace(/^booth\./, '')
    .replace(/-admin\./g, '.')
    .replace(/-booth\./g, '.')
  const portSuffix = port ? `:${port}` : ''
  return `${protocol}//${customerHost}${portSuffix}`
}

/**
 * slug 로 festival 단건 조회 (소속 programs 함께)
 */
export async function fetchFestivalBySlug(slug: string): Promise<{
  festival: Festival
  programs: Program[]
} | null> {
  const { data: festival, error: festivalError } = await supabase
    .from('festivals')
    .select('*')
    .eq('slug', slug)
    .eq('is_active', true)
    .single()

  if (festivalError || !festival) return null

  const { data: programs, error: programsError } = await supabase
    .from('programs')
    .select('*')
    .eq('festival_id', festival.id)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  if (programsError) return { festival, programs: [] }

  return { festival, programs: programs ?? [] }
}

/**
 * festival_events 조회 (musan: 개막식 / 폐막식 / 기타 프로그램)
 * kind 필터 옵션. 미지정 시 전체.
 */
export async function fetchFestivalEvents(
  festivalId: string,
  kind?: FestivalEvent['kind'] | FestivalEvent['kind'][]
): Promise<FestivalEvent[]> {
  let query = supabase
    .from('festival_events')
    .select('*')
    .eq('festival_id', festivalId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  if (kind) {
    if (Array.isArray(kind)) query = query.in('kind', kind)
    else query = query.eq('kind', kind)
  }

  const { data, error } = await query
  if (error) return []
  return (data ?? []) as FestivalEvent[]
}

/**
 * festival_guests 조회 (musan: 스페셜 게스트)
 */
export async function fetchFestivalGuests(festivalId: string): Promise<FestivalGuest[]> {
  const { data, error } = await supabase
    .from('festival_guests')
    .select('*')
    .eq('festival_id', festivalId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
  if (error) return []
  return (data ?? []) as FestivalGuest[]
}

/**
 * food_booths + 각 booth 의 menus 조회 (food: 매장 안내)
 */
export async function fetchFoodBooths(festivalId: string): Promise<FoodBoothWithMenus[]> {
  const { data: booths, error: boothErr } = await supabase
    .from('food_booths')
    .select('*')
    .eq('festival_id', festivalId)
    .eq('is_active', true)
    .order('booth_no', { ascending: true })
  if (boothErr || !booths || booths.length === 0) return []

  const boothIds = booths.map((b) => b.id)
  const { data: menus, error: menuErr } = await supabase
    .from('food_menus')
    .select('*')
    .in('booth_id', boothIds)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  const menusByBooth = new Map<string, FoodMenu[]>()
  if (!menuErr && menus) {
    for (const m of menus as FoodMenu[]) {
      const list = menusByBooth.get(m.booth_id) ?? []
      list.push(m)
      menusByBooth.set(m.booth_id, list)
    }
  }

  return (booths as FoodBooth[]).map((b) => ({
    ...b,
    menus: menusByBooth.get(b.id) ?? [],
  }))
}
