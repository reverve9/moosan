-- ============================================================================
-- 29_real_categories_real_booths.sql
-- 카테고리 도입 — 음식문화페스티벌 실제 26개 부스 정합화
--
-- 변경 내용
-- 1) food_categories 갈아끼움: 'a/b/c' (구역) → 'meal/beverage/dessert' (카테고리)
--    라벨: 식사 / 음료·주류 / 디저트
--    음료와 주류는 한 카테고리(beverage)로 묶음.
-- 2) 기존 20개 부스의 booth_no / category / sort_order 정합화 (이름 변경 4건 포함)
-- 3) 신규 6개 부스 추가 (홀리호두 / 속초시골집 / 러브마린 / 동해쌀국수 /
--    속초 크래프트루트 / 몽트비어)
-- 4) 기존에 입력된 food_menus / booth_accounts / orders 등은 보존 (UPDATE 방식)
--
-- 부스번호 prefix 규칙
--    M = 식사 (M01~M13, 13개)
--    B = 음료·주류 (B01~B03, 3개)
--    D = 디저트 (D01~D10, 10개)
--    합계 26개
--
-- sort_order 는 운영진 제공 위치 1~26 그대로 (물리 배치 순서).
-- ============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 0) food festival 존재 확인 + id 캐시
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_food_id UUID;
BEGIN
  SELECT id INTO v_food_id FROM festivals WHERE slug = 'food';
  IF v_food_id IS NULL THEN
    RAISE EXCEPTION 'festivals.slug = ''food'' 가 존재하지 않습니다. 05_musan_food.sql 먼저 실행하세요.';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) food_categories 갈아끼움
--    booth.category 는 soft FK(슬러그 일치)라 FK 제약은 없음.
--    DELETE 직후 INSERT — 같은 트랜잭션 내라 외부 영향 없음.
-- ─────────────────────────────────────────────────────────────────────────────

DELETE FROM food_categories;

INSERT INTO food_categories (slug, label, sort_order, is_active) VALUES
  ('meal',     '식사',       1, true),
  ('beverage', '음료·주류',  2, true),
  ('dessert',  '디저트',     3, true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) 기존 20개 부스 정합화 — booth_no / category / sort_order (필요 시 name)
--    이름 변경: 속초다오레호떡 → 다오레 속초호떡
--               돈가스렛 → 돈까스렛
--               딜리조이쌀국수 → 딜리조이 쌀국수
--               에크랑베이크샵 → 에크랑 베이커리
--    매칭 키: 기존 name (현재 DB 에 저장된 값)
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_food_id UUID := (SELECT id FROM festivals WHERE slug = 'food');
BEGIN

  -- ─── 디저트 (D01~D10) — 10개, 그 중 신규 1건 (D05 홀리호두) ───
  UPDATE food_booths
    SET booth_no='D01', category='dessert', sort_order=1
    WHERE festival_id=v_food_id AND name='속초태선김부각';

  UPDATE food_booths
    SET booth_no='D02', category='dessert', name='다오레 속초호떡', sort_order=2
    WHERE festival_id=v_food_id AND name='속초다오레호떡';

  UPDATE food_booths
    SET booth_no='D03', category='dessert', sort_order=3
    WHERE festival_id=v_food_id AND name='고쌤베이커리';

  UPDATE food_booths
    SET booth_no='D04', category='dessert', sort_order=4
    WHERE festival_id=v_food_id AND name='쿠키사무소 지음';

  -- D05 홀리호두 — 신규 (아래 INSERT)

  UPDATE food_booths
    SET booth_no='D06', category='dessert', sort_order=7
    WHERE festival_id=v_food_id AND name='바다씨';

  UPDATE food_booths
    SET booth_no='D07', category='dessert', sort_order=10
    WHERE festival_id=v_food_id AND name='카페백촌';

  UPDATE food_booths
    SET booth_no='D08', category='dessert', sort_order=14
    WHERE festival_id=v_food_id AND name='속초보구밍샵';

  UPDATE food_booths
    SET booth_no='D09', category='dessert', sort_order=17
    WHERE festival_id=v_food_id AND name='츄러스미';

  UPDATE food_booths
    SET booth_no='D10', category='dessert', name='에크랑 베이커리', sort_order=22
    WHERE festival_id=v_food_id AND name='에크랑베이크샵';

  -- ─── 식사 (M01~M13) — 13개, 그 중 신규 4건 (M05/M07/M09 + 없음) ───
  UPDATE food_booths
    SET booth_no='M01', category='meal', sort_order=5
    WHERE festival_id=v_food_id AND name='워블워즐';

  UPDATE food_booths
    SET booth_no='M02', category='meal', sort_order=8
    WHERE festival_id=v_food_id AND name='속초해안가';

  UPDATE food_booths
    SET booth_no='M03', category='meal', sort_order=9
    WHERE festival_id=v_food_id AND name='키친디빠빠';

  UPDATE food_booths
    SET booth_no='M04', category='meal', sort_order=11
    WHERE festival_id=v_food_id AND name='흑돈속초고기';

  -- M05 속초시골집 — 신규
  UPDATE food_booths
    SET booth_no='M06', category='meal', sort_order=13
    WHERE festival_id=v_food_id AND name='제제네식탁';

  -- M07 러브마린 — 신규
  UPDATE food_booths
    SET booth_no='M08', category='meal', name='딜리조이 쌀국수', sort_order=16
    WHERE festival_id=v_food_id AND name='딜리조이쌀국수';

  -- M09 동해쌀국수 — 신규
  UPDATE food_booths
    SET booth_no='M10', category='meal', name='돈까스렛', sort_order=20
    WHERE festival_id=v_food_id AND name='돈가스렛';

  UPDATE food_booths
    SET booth_no='M11', category='meal', sort_order=21
    WHERE festival_id=v_food_id AND name='속초어부가';

  UPDATE food_booths
    SET booth_no='M12', category='meal', sort_order=23
    WHERE festival_id=v_food_id AND name='서담쌀국수';

  UPDATE food_booths
    SET booth_no='M13', category='meal', sort_order=24
    WHERE festival_id=v_food_id AND name='면구소';

  -- ─── 음료·주류 (B01~B03) — 3개, 그 중 신규 2건 (B02, B03) ───
  UPDATE food_booths
    SET booth_no='B01', category='beverage', sort_order=18
    WHERE festival_id=v_food_id AND name='집카페';

  -- B02 속초 크래프트루트 — 신규
  -- B03 몽트비어 — 신규

  -- ─── 신규 6개 부스 INSERT ───
  INSERT INTO food_booths
    (festival_id, booth_no, name, category, sort_order, is_active, is_open, is_paused)
  VALUES
    (v_food_id, 'D05', '홀리호두',         'dessert',  6,  true, false, false),
    (v_food_id, 'M05', '속초시골집',       'meal',     12, true, false, false),
    (v_food_id, 'M07', '러브마린',         'meal',     15, true, false, false),
    (v_food_id, 'M09', '동해쌀국수',       'meal',     19, true, false, false),
    (v_food_id, 'B02', '속초 크래프트루트', 'beverage', 25, true, false, false),
    (v_food_id, 'B03', '몽트비어',         'beverage', 26, true, false, false);

END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 검증 쿼리 (실행 후 확인용)
-- ─────────────────────────────────────────────────────────────────────────────
-- SELECT slug, label, sort_order FROM food_categories ORDER BY sort_order;
--
-- SELECT booth_no, name, category, sort_order
-- FROM food_booths
-- WHERE festival_id = (SELECT id FROM festivals WHERE slug='food')
-- ORDER BY sort_order;
--
-- 카테고리 분포 확인 — 식사 13 / 음료·주류 3 / 디저트 10 = 합계 26
-- SELECT category, COUNT(*) FROM food_booths
-- WHERE festival_id = (SELECT id FROM festivals WHERE slug='food')
-- GROUP BY category ORDER BY category;

COMMIT;
