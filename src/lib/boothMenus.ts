import { supabase } from './supabase'
import type { FoodMenu } from '@/types/database'

/**
 * 본인 부스의 활성 메뉴 목록.
 * is_active = true 만 (어드민에서 숨긴 메뉴는 매장에도 미노출).
 */
export async function fetchBoothMenus(boothId: string): Promise<FoodMenu[]> {
  const { data, error } = await supabase
    .from('food_menus')
    .select()
    .eq('booth_id', boothId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (error) throw new Error(`메뉴 조회 실패: ${error.message}`)
  return data ?? []
}

/** 단일 메뉴 품절 토글 */
export async function setMenuSoldOut(
  menuId: string,
  soldOut: boolean,
): Promise<void> {
  const { error } = await supabase
    .from('food_menus')
    .update({ is_sold_out: soldOut })
    .eq('id', menuId)
  if (error) throw new Error(`품절 상태 변경 실패: ${error.message}`)
}
