-- ============================================================================
-- test_waiting_status.sql  (마이그레이션 아님 — 테스트 데이터 생성기)
-- ============================================================================
--
-- 매장 카드 대기 배지 / 향후 BoothModal/CheckoutPage 대기 현황 / Phase 2C
-- 매장 dashboard 의 "확인" 흐름까지 검증할 수 있는 가짜 주문 시드.
--
-- 타깃 매장: "속초 오징어순대" (sort_order 1 — food 페이지 가장 위)
-- 타깃 메뉴: "오징어순대 한 접시" (12,000원)
-- 가짜 주문 phone: 010-9999-9999  (cleanup 시 키 역할)
--
-- 사용법:
--   Supabase Studio → SQL Editor 에 이 파일 내용 복붙
--   아래 블록 중 필요한 것만 선택해서 실행 (각 블록은 독립적)
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- A. 현재 상태 한눈에 보기
--    상위 8개 부스의 대기 카운트 + avg_prep_minutes
--    실행 후 카드 배지와 비교
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
  fb.sort_order,
  fb.booth_no,
  fb.name,
  COALESCE(bwc.waiting_count, 0) AS waiting_count,
  fb.avg_prep_minutes
FROM food_booths fb
LEFT JOIN booth_waiting_counts bwc ON bwc.booth_id = fb.id
WHERE fb.is_active = true
  AND fb.festival_id = (SELECT id FROM festivals WHERE slug = 'food')
ORDER BY fb.sort_order
LIMIT 8;


-- ─────────────────────────────────────────────────────────────────────────────
-- B. 속초 오징어순대에 가짜 주문 +1
--    실행할 때마다 그 부스 카운트 +1
--    1회 → 대기 1건 (주황) / 5회 → 대기 5건 / 6회 → 혼잡 6건 (빨강)
--    UI 새로고침 없이 Realtime 으로 즉시 반영되는지 확인
-- ─────────────────────────────────────────────────────────────────────────────

WITH target AS (
  SELECT
    b.id   AS booth_id,
    b.name AS booth_name,
    m.id   AS menu_id,
    m.name AS menu_name,
    m.price
  FROM food_booths b
  JOIN food_menus m ON m.booth_id = b.id
  WHERE b.festival_id = (SELECT id FROM festivals WHERE slug = 'food')
    AND b.booth_no = '01'
    AND b.is_active = true
    AND m.is_active = true
    AND m.price IS NOT NULL
  ORDER BY m.sort_order
  LIMIT 1
),
new_order AS (
  INSERT INTO orders (phone, total_amount, status)
  SELECT '010-9999-9999', t.price, 'paid'
  FROM target t
  RETURNING id
)
INSERT INTO order_items
  (order_id, booth_id, menu_id, booth_name, menu_name, menu_price, quantity, subtotal)
SELECT
  no.id, t.booth_id, t.menu_id, t.booth_name, t.menu_name, t.price, 1, t.price
FROM new_order no, target t;


-- ─────────────────────────────────────────────────────────────────────────────
-- C. 한 부스에 N건 한 번에 추가 (테스트 가속용)
--    v_count 만 바꿔서 실행 → N개 주문 한 번에 생성
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_count        INTEGER := 5;  -- ← 여기 N 변경
  v_target_booth TEXT    := '01';  -- ← 다른 부스 테스트하려면 booth_no 변경
  v_booth_id     UUID;
  v_booth_name   TEXT;
  v_menu_id      UUID;
  v_menu_name    TEXT;
  v_menu_price   INTEGER;
  v_order_id     UUID;
  i INTEGER;
BEGIN
  SELECT b.id, b.name, m.id, m.name, m.price
    INTO v_booth_id, v_booth_name, v_menu_id, v_menu_name, v_menu_price
  FROM food_booths b
  JOIN food_menus m ON m.booth_id = b.id
  WHERE b.festival_id = (SELECT id FROM festivals WHERE slug = 'food')
    AND b.booth_no = v_target_booth
    AND b.is_active = true
    AND m.is_active = true
    AND m.price IS NOT NULL
  ORDER BY m.sort_order
  LIMIT 1;

  IF v_booth_id IS NULL THEN
    RAISE EXCEPTION '대상 부스/메뉴를 찾을 수 없습니다 (booth_no=%)', v_target_booth;
  END IF;

  FOR i IN 1..v_count LOOP
    INSERT INTO orders (phone, total_amount, status)
    VALUES ('010-9999-9999', v_menu_price, 'paid')
    RETURNING id INTO v_order_id;

    INSERT INTO order_items
      (order_id, booth_id, menu_id, booth_name, menu_name, menu_price, quantity, subtotal)
    VALUES
      (v_order_id, v_booth_id, v_menu_id, v_booth_name, v_menu_name, v_menu_price, 1, v_menu_price);
  END LOOP;

  RAISE NOTICE '✅ % 에 가짜 주문 % 건 추가 완료', v_booth_name, v_count;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- D. 여러 부스에 동시 분산 추가 (한 화면에 다양한 배지 색 동시 확인)
--    (booth_no, count) 쌍을 VALUES 로 정의 — 원하는 만큼 행 추가/수정
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  r RECORD;
  v_booth_id   UUID;
  v_booth_name TEXT;
  v_menu_id    UUID;
  v_menu_name  TEXT;
  v_menu_price INTEGER;
  v_order_id   UUID;
  i INTEGER;
BEGIN
  FOR r IN
    SELECT booth_no, cnt
    FROM (VALUES
      ('01', 0),   -- 속초 오징어순대 — 여유 (skip)
      ('02', 3),   -- 강릉 초당순두부 — 대기 3건
      ('03', 6),   -- 평창 메밀막국수 — 혼잡 6건
      ('08', 1),   -- 차이나타운 짬뽕 — 대기 1건
      ('15', 8)    -- 속초 스시 모리 — 혼잡 8건
    ) AS t(booth_no, cnt)
  LOOP
    IF r.cnt = 0 THEN CONTINUE; END IF;

    SELECT b.id, b.name, m.id, m.name, m.price
      INTO v_booth_id, v_booth_name, v_menu_id, v_menu_name, v_menu_price
    FROM food_booths b
    JOIN food_menus m ON m.booth_id = b.id
    WHERE b.festival_id = (SELECT id FROM festivals WHERE slug = 'food')
      AND b.booth_no = r.booth_no
      AND b.is_active = true
      AND m.is_active = true
      AND m.price IS NOT NULL
    ORDER BY m.sort_order
    LIMIT 1;

    IF v_booth_id IS NULL THEN
      RAISE NOTICE '⚠️  부스 % 를 찾을 수 없어 건너뜀', r.booth_no;
      CONTINUE;
    END IF;

    FOR i IN 1..r.cnt LOOP
      INSERT INTO orders (phone, total_amount, status)
      VALUES ('010-9999-9999', v_menu_price, 'paid')
      RETURNING id INTO v_order_id;

      INSERT INTO order_items
        (order_id, booth_id, menu_id, booth_name, menu_name, menu_price, quantity, subtotal)
      VALUES
        (v_order_id, v_booth_id, v_menu_id, v_booth_name, v_menu_name, v_menu_price, 1, v_menu_price);
    END LOOP;

    RAISE NOTICE '✅ % 에 % 건 추가', v_booth_name, r.cnt;
  END LOOP;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- E. 매장 "확인" 시뮬레이션 — 가장 오래된 미확인 1건의 confirmed_at 을 now() 로
--    실행할 때마다 -1 → 카드 배지 카운트 빠짐
--    Phase 2C 매장 dashboard 의 "확인" 버튼 동작 미리 검증
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE order_items
SET confirmed_at = now()
WHERE id = (
  SELECT oi.id
  FROM order_items oi
  JOIN orders o ON o.id = oi.order_id
  WHERE o.phone = '010-9999-9999'
    AND oi.confirmed_at IS NULL
  ORDER BY oi.created_at ASC
  LIMIT 1
);


-- ─────────────────────────────────────────────────────────────────────────────
-- F. 전체 cleanup — 가짜 주문 (010-9999-9999) 모두 삭제
--    order_items 는 FK ON DELETE CASCADE 로 함께 삭제됨
--    테스트 끝나면 반드시 실행
-- ─────────────────────────────────────────────────────────────────────────────

DELETE FROM orders WHERE phone = '010-9999-9999';

-- 확인: 0 이어야 함
SELECT COUNT(*) AS remaining_test_orders
FROM orders
WHERE phone = '010-9999-9999';
