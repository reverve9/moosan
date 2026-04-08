-- ============================================
-- 음식문화페스티벌 v2 addon 컬럼 추가
-- (food_payment_system_prompt_v2_addon.md 반영)
-- 08_orders.sql 실행 후에 실행
-- ============================================

-- ──── order_items: 매장 확인 시각 (배민 스타일) ────
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_order_items_booth_confirmed
  ON order_items (booth_id, confirmed_at);

-- ──── food_menus: 품절 토글 ────
ALTER TABLE food_menus
  ADD COLUMN IF NOT EXISTS is_sold_out BOOLEAN NOT NULL DEFAULT false;
