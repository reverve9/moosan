-- ============================================
-- food_booths.category 추가 (한식 / 중식 / 일식 / 퓨전)
-- 05_musan_food.sql 이후 실행
-- ============================================

ALTER TABLE food_booths ADD COLUMN IF NOT EXISTS category TEXT
  CHECK (category IS NULL OR category IN ('korean', 'chinese', 'japanese', 'fusion'));

-- 기존 시드 행 카테고리 채우기 (전부 한식 계열)
UPDATE food_booths SET category = 'korean'
  WHERE booth_no IN ('01', '02', '03') AND category IS NULL;
