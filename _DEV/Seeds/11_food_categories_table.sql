-- ============================================================================
-- 11_food_categories_table.sql
-- 음식문화페스티벌 — 카테고리 CRUD 화
-- ============================================================================
--
-- 변경 내용
-- 1) food_categories 테이블 신규 (id / slug / label / sort_order / is_active)
-- 2) 기존 4종 (korean / chinese / japanese / fusion) seed
-- 3) food_booths.category 의 CHECK 제약 제거 (slug 가 자유롭게 변하므로)
--    — 무결성은 어드민 select UI + 앱 단에서 보장. 외래키는 걸지 않음
--      (slug 가 사용자 편의를 위해 변경 가능해야 하고, 변경 시 cascade 부담)
-- 4) RLS: anon read / authenticated full
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) food_categories 테이블
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS food_categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT NOT NULL UNIQUE,
  label       TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE food_categories IS
  '음식 페스티벌 매장 카테고리 마스터. food_booths.category 가 이 테이블의 slug 를
   참조 (소프트 FK). 어드민에서 자유 추가/삭제.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) 초기 4종 seed
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO food_categories (slug, label, sort_order)
VALUES
  ('korean',   '한식', 1),
  ('chinese',  '중식', 2),
  ('japanese', '일식', 3),
  ('fusion',   '퓨전', 4)
ON CONFLICT (slug) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) food_booths.category 의 CHECK 제약 제거
-- ─────────────────────────────────────────────────────────────────────────────
--
-- 06_food_categories.sql 에서 추가한 CHECK 제약을 찾아서 drop.
-- 제약 이름은 시스템이 자동 생성하므로 information_schema 에서 동적으로 찾는다.

DO $$
DECLARE
  con_name TEXT;
BEGIN
  FOR con_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'food_booths'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%category%'
  LOOP
    EXECUTE format('ALTER TABLE food_booths DROP CONSTRAINT IF EXISTS %I', con_name);
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) RLS
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE food_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "food_categories_read_all" ON food_categories;
CREATE POLICY "food_categories_read_all"
  ON food_categories FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "food_categories_write_authenticated" ON food_categories;
CREATE POLICY "food_categories_write_authenticated"
  ON food_categories FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- 어드민이 anon key 로 동작하면 위 정책으로는 쓰기 차단됨.
-- 현재 어드민은 sessionStorage 기반이고 supabase 는 anon key 만 씀 → write 도 anon 허용 필요
DROP POLICY IF EXISTS "food_categories_write_anon" ON food_categories;
CREATE POLICY "food_categories_write_anon"
  ON food_categories FOR ALL
  USING (true)
  WITH CHECK (true);

-- 검증
-- SELECT * FROM food_categories ORDER BY sort_order;
