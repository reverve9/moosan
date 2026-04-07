/**
 * musan / food 페이지 확장 테이블 타입 (05_musan_food.sql)
 * Database 인터페이스에 정식 편입 전 임시 standalone 타입.
 */

export interface FestivalEvent {
  id: string
  festival_id: string
  slug: string | null
  name: string
  kind: 'opening' | 'closing' | 'program'
  schedule: string | null
  venue: string | null
  description: string | null
  thumbnail_url: string | null
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface FestivalGuest {
  id: string
  festival_id: string
  name: string
  description: string | null
  photo_url: string | null
  link_url: string | null
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface FoodBooth {
  id: string
  festival_id: string
  booth_no: string | null
  name: string
  description: string | null
  thumbnail_url: string | null
  gallery_urls: string[]
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface FoodMenu {
  id: string
  booth_id: string
  name: string
  price: number | null
  description: string | null
  image_url: string | null
  is_signature: boolean
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

/** food_booths + 그 부스의 menus 묶음 */
export interface FoodBoothWithMenus extends FoodBooth {
  menus: FoodMenu[]
}
