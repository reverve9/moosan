import { supabase } from './supabase'

export interface FoodCategoryRow {
  id: string
  slug: string
  label: string
  sort_order: number
  is_active: boolean
  created_at: string
}

/**
 * 카테고리 컬러 매핑 — categories 배열 내 위치(sort_order 정렬 후 인덱스) 를
 * 5색 사이클로 반환. CSS 모듈 쪽에 catColor0..catColor4 클래스가 있어야 함.
 */
export const CATEGORY_COLOR_COUNT = 5

export function getCategoryColorIndex(
  slug: string | null | undefined,
  categories: FoodCategoryRow[],
): number {
  if (!slug) return 0
  const idx = categories.findIndex((c) => c.slug === slug)
  if (idx < 0) return 0
  return idx % CATEGORY_COLOR_COUNT
}

/**
 * 카테고리 마스터 — slug 가 food_booths.category 의 값.
 * is_active 무관 전부 fetch (어드민/사용자 양쪽에서 표시 결정은 호출자가).
 */
export async function fetchFoodCategories(): Promise<FoodCategoryRow[]> {
  const { data, error } = await supabase
    .from('food_categories')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('label', { ascending: true })
  if (error) throw new Error(`카테고리 불러오기 실패: ${error.message}`)
  return data ?? []
}

export async function createFoodCategory(input: {
  slug: string
  label: string
  sort_order?: number
}): Promise<FoodCategoryRow> {
  const slug = input.slug.trim()
  const { data, error } = await supabase
    .from('food_categories')
    .insert({
      slug,
      label: input.label.trim(),
      sort_order: input.sort_order ?? 0,
    })
    .select()
    .single()
  if (error) {
    // Postgres unique_violation
    if (error.code === '23505') {
      throw new Error(`이미 존재하는 slug 입니다: '${slug}'`)
    }
    throw new Error(`카테고리 추가 실패: ${error.message}`)
  }
  return data
}

export async function deleteFoodCategory(id: string, slug: string): Promise<void> {
  // 사용 중인 부스가 있으면 삭제 불가 (앱 단 가드)
  const { count, error: countErr } = await supabase
    .from('food_booths')
    .select('id', { count: 'exact', head: true })
    .eq('category', slug)
  if (countErr) throw new Error(`사용 여부 확인 실패: ${countErr.message}`)
  if ((count ?? 0) > 0) {
    throw new Error(
      `이 카테고리를 사용하는 매장이 ${count}개 있습니다. 먼저 해당 매장의 카테고리를 변경하세요.`,
    )
  }
  const { error } = await supabase.from('food_categories').delete().eq('id', id)
  if (error) throw new Error(`카테고리 삭제 실패: ${error.message}`)
}
