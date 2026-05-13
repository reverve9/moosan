-- ============================================================================
-- 25_zones_real_booths.sql
-- 무산문화축전 — 실제 매장 20개 시드 (A/B/C 3개 구역)
-- ============================================================================
--
-- 변경 내용
-- 1) food_categories 마스터를 [A구역 / B구역 / C구역] 3개로 갈아끼움
--    카테고리 컨셉을 폐기하고 "구역"으로 재활용.
-- 2) food festival 의 기존 더미 부스/메뉴/계정/주문 전부 삭제 (slug='food')
-- 3) 실제 20개 매장을 가나다 순으로 A01~A07 / B01~B07 / C01~C06 부여하여 insert
--    배정은 임시 — 어드민에서 매장별로 booth_no / category 변경 가능.
-- 4) 메뉴/이미지/설명은 어드민에서 직접 입력 → 본 시드에서는 비움
--
-- idempotent — 같은 페스티벌에 한해 여러 번 돌려도 결과 동일.
-- ============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 0) 대상 페스티벌 ID 캐시 (없으면 곧장 에러)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_food_festival_id UUID;
BEGIN
  SELECT id INTO v_food_festival_id FROM festivals WHERE slug = 'food';
  IF v_food_festival_id IS NULL THEN
    RAISE EXCEPTION 'festivals.slug = ''food'' 가 존재하지 않습니다. 05_musan_food.sql 먼저 실행하세요.';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) 기존 food festival 더미 데이터 정리
--    의존성 순서: order_items → orders → food_menus → booth_accounts → food_booths
-- ─────────────────────────────────────────────────────────────────────────────

-- order_items (orders 경유)
DELETE FROM order_items
WHERE order_id IN (
  SELECT o.id FROM orders o
  WHERE o.festival_id = (SELECT id FROM festivals WHERE slug = 'food')
);

-- orders (food festival 의 모든 주문)
-- payments 는 orders.payment_id 의 부모 — orders 삭제 후 고아가 된 payments 도 정리
DELETE FROM orders
WHERE festival_id = (SELECT id FROM festivals WHERE slug = 'food');

DELETE FROM payments
WHERE id NOT IN (SELECT payment_id FROM orders WHERE payment_id IS NOT NULL);

-- food_menus (food festival 부스의 메뉴)
DELETE FROM food_menus
WHERE booth_id IN (
  SELECT id FROM food_booths
  WHERE festival_id = (SELECT id FROM festivals WHERE slug = 'food')
);

-- booth_accounts (food festival 부스 로그인 계정 — 새 부스 기준 재발급)
DELETE FROM booth_accounts
WHERE booth_id IN (
  SELECT id FROM food_booths
  WHERE festival_id = (SELECT id FROM festivals WHERE slug = 'food')
);

-- food_booths
DELETE FROM food_booths
WHERE festival_id = (SELECT id FROM festivals WHERE slug = 'food');

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) food_categories 갈아끼움 — 카테고리 → 구역 (A/B/C)
--    food_booths.category 는 soft FK 라 슬러그만 일치하면 됨 (실제 FK 제약 없음)
-- ─────────────────────────────────────────────────────────────────────────────

DELETE FROM food_categories;

INSERT INTO food_categories (slug, label, sort_order, is_active) VALUES
  ('a', 'A구역', 1, true),
  ('b', 'B구역', 2, true),
  ('c', 'C구역', 3, true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) 실제 20개 매장 insert
--    가나다 순으로 정렬하여 임의 배정. 운영 측에서 어드민으로 자유 변경.
--    booth_no 형식: {구역대문자}{2자리} → 'A01' .. 'C06'
--    sort_order 는 booth_no 와 매칭(전체 통일).
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO food_booths
  (festival_id, booth_no, name, category, sort_order, is_active, is_open, is_paused)
SELECT
  (SELECT id FROM festivals WHERE slug = 'food'),
  v.booth_no, v.name, v.category, v.sort_order,
  true, false, false
FROM (VALUES
  -- ─── A구역 (7) ───
  ('A01', '고쌤베이커리',     'a',  1),
  ('A02', '돈가스렛',         'a',  2),
  ('A03', '딜리조이쌀국수',   'a',  3),
  ('A04', '면구소',           'a',  4),
  ('A05', '바다씨',           'a',  5),
  ('A06', '서담쌀국수',       'a',  6),
  ('A07', '속초다오레호떡',   'a',  7),
  -- ─── B구역 (7) ───
  ('B01', '속초보구밍샵',     'b',  8),
  ('B02', '속초어부가',       'b',  9),
  ('B03', '속초태선김부각',   'b', 10),
  ('B04', '속초해안가',       'b', 11),
  ('B05', '에크랑베이크샵',   'b', 12),
  ('B06', '워블워즐',         'b', 13),
  ('B07', '제제네식탁',       'b', 14),
  -- ─── C구역 (6) ───
  ('C01', '집카페',           'c', 15),
  ('C02', '츄러스미',         'c', 16),
  ('C03', '카페백촌',         'c', 17),
  ('C04', '쿠키사무소 지음',  'c', 18),
  ('C05', '키친디빠빠',       'c', 19),
  ('C06', '흑돈속초고기',     'c', 20)
) AS v(booth_no, name, category, sort_order);

-- ─────────────────────────────────────────────────────────────────────────────
-- 검증 쿼리 (실행 후 직접 확인용)
-- ─────────────────────────────────────────────────────────────────────────────
-- SELECT slug, label, sort_order FROM food_categories ORDER BY sort_order;
-- SELECT booth_no, name, category FROM food_booths
--   WHERE festival_id = (SELECT id FROM festivals WHERE slug='food')
--   ORDER BY sort_order;

COMMIT;
