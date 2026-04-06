import { supabase } from './supabase'
import type { Festival, Program } from '@/types/database'

const STORAGE_BUCKET = 'festival-assets'

/**
 * Storage path → public URL
 * 예: 'festivals/youth/poster.png' → 'https://...supabase.co/storage/v1/object/public/festival-assets/festivals/youth/poster.png'
 */
export function getAssetUrl(path: string | null | undefined): string | null {
  if (!path) return null
  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path)
  return data.publicUrl
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
