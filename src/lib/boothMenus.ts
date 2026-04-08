import { supabase } from './supabase'
import type { FoodBooth, FoodMenu } from '@/types/database'

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

/** 본인 부스 row 조회 (is_open / is_paused 포함) */
export async function fetchBoothStatus(boothId: string): Promise<FoodBooth | null> {
  const { data, error } = await supabase
    .from('food_booths')
    .select()
    .eq('id', boothId)
    .maybeSingle()
  if (error) throw new Error(`부스 조회 실패: ${error.message}`)
  return data
}

/** 영업 상태 토글 (영업 중 <-> 영업 종료) */
export async function setBoothOpen(boothId: string, isOpen: boolean): Promise<void> {
  const { error } = await supabase
    .from('food_booths')
    .update({ is_open: isOpen })
    .eq('id', boothId)
  if (error) throw new Error(`영업 상태 변경 실패: ${error.message}`)
}

/** 준비 중 토글 */
export async function setBoothPaused(boothId: string, isPaused: boolean): Promise<void> {
  const { error } = await supabase
    .from('food_booths')
    .update({ is_paused: isPaused })
    .eq('id', boothId)
  if (error) throw new Error(`준비 중 상태 변경 실패: ${error.message}`)
}
