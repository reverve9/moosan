-- ============================================
-- 2026 설악무산문화축전 — musan / food 페이지 확장 스키마 + 시드
-- 01_schema.sql, 02_programs.sql 실행 후 실행
-- ============================================

-- ────────────────────────────────────────────
-- festivals 컬럼 추가: food 페이지 부스 위치도 이미지
-- ────────────────────────────────────────────
ALTER TABLE festivals ADD COLUMN IF NOT EXISTS layout_image_url TEXT;
-- (food 부스 평면도, storage path 예: 'festivals/food/layout.png')


-- ============================================
-- 1) festival_events
--    musan 페이지: 개막식 / 폐막식 / 기타 프로그램
--    참가신청이 없는 단순 일정·정보성 이벤트
-- ============================================
CREATE TABLE IF NOT EXISTS festival_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  festival_id UUID NOT NULL REFERENCES festivals(id) ON DELETE CASCADE,
  slug TEXT,                                 -- 'opening' | 'closing' | 자유
  name TEXT NOT NULL,                        -- '개막식' / '시민 합창제' 등
  kind TEXT NOT NULL DEFAULT 'program'
    CHECK (kind IN ('opening', 'closing', 'program')),
  schedule TEXT,                             -- '2026년 5월 15일(금) 19:00'
  venue TEXT,
  description TEXT,
  thumbnail_url TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_festival_events_festival
  ON festival_events(festival_id, sort_order);

DROP TRIGGER IF EXISTS trg_festival_events_updated_at ON festival_events;
CREATE TRIGGER trg_festival_events_updated_at
  BEFORE UPDATE ON festival_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE festival_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "festival_events_select" ON festival_events;
CREATE POLICY "festival_events_select" ON festival_events FOR SELECT USING (true);

DROP POLICY IF EXISTS "festival_events_all" ON festival_events;
CREATE POLICY "festival_events_all" ON festival_events FOR ALL USING (true);


-- ============================================
-- 2) festival_guests
--    musan 페이지: 스페셜 게스트 카드 (사진 + 이름 + 한 줄 소개)
-- ============================================
CREATE TABLE IF NOT EXISTS festival_guests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  festival_id UUID NOT NULL REFERENCES festivals(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                        -- '카더가든'
  description TEXT,                          -- 한 줄 소개
  photo_url TEXT,                            -- 인물 사진 (storage path)
  link_url TEXT,                             -- 외부 링크 (인스타/공식 등, 옵션)
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_festival_guests_festival
  ON festival_guests(festival_id, sort_order);

DROP TRIGGER IF EXISTS trg_festival_guests_updated_at ON festival_guests;
CREATE TRIGGER trg_festival_guests_updated_at
  BEFORE UPDATE ON festival_guests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE festival_guests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "festival_guests_select" ON festival_guests;
CREATE POLICY "festival_guests_select" ON festival_guests FOR SELECT USING (true);

DROP POLICY IF EXISTS "festival_guests_all" ON festival_guests;
CREATE POLICY "festival_guests_all" ON festival_guests FOR ALL USING (true);


-- ============================================
-- 3) food_booths
--    food 페이지: 매장 카드 (썸네일 + 매장명 + 부스번호 + 갤러리)
-- ============================================
CREATE TABLE IF NOT EXISTS food_booths (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  festival_id UUID NOT NULL REFERENCES festivals(id) ON DELETE CASCADE,
  booth_no TEXT,                             -- '01' / 'A-3' 등 자유
  name TEXT NOT NULL,                        -- 매장명
  description TEXT,                          -- 한 줄 소개
  thumbnail_url TEXT,                        -- 카드 썸네일 (storage path)
  gallery_urls JSONB NOT NULL DEFAULT '[]'::jsonb,  -- 매장 사진 배열
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_food_booths_festival
  ON food_booths(festival_id, sort_order);

DROP TRIGGER IF EXISTS trg_food_booths_updated_at ON food_booths;
CREATE TRIGGER trg_food_booths_updated_at
  BEFORE UPDATE ON food_booths
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE food_booths ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "food_booths_select" ON food_booths;
CREATE POLICY "food_booths_select" ON food_booths FOR SELECT USING (true);

DROP POLICY IF EXISTS "food_booths_all" ON food_booths;
CREATE POLICY "food_booths_all" ON food_booths FOR ALL USING (true);


-- ============================================
-- 4) food_menus
--    food 페이지: 매장별 메뉴 (이름 / 가격 / 설명)
-- ============================================
CREATE TABLE IF NOT EXISTS food_menus (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booth_id UUID NOT NULL REFERENCES food_booths(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                        -- 메뉴명
  price INT,                                 -- 가격(원). NULL = '시가' 등
  description TEXT,                          -- 메뉴 설명
  image_url TEXT,                            -- 메뉴 사진(옵션, storage path)
  is_signature BOOLEAN NOT NULL DEFAULT false, -- 대표 메뉴 표시
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_food_menus_booth
  ON food_menus(booth_id, sort_order);

DROP TRIGGER IF EXISTS trg_food_menus_updated_at ON food_menus;
CREATE TRIGGER trg_food_menus_updated_at
  BEFORE UPDATE ON food_menus
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE food_menus ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "food_menus_select" ON food_menus;
CREATE POLICY "food_menus_select" ON food_menus FOR SELECT USING (true);

DROP POLICY IF EXISTS "food_menus_all" ON food_menus;
CREATE POLICY "food_menus_all" ON food_menus FOR ALL USING (true);


-- ============================================
-- 시드: musan — festival_events (개막식 / 폐막식)
-- ============================================
INSERT INTO festival_events (festival_id, slug, name, kind, schedule, venue, description, sort_order)
SELECT f.id, 'opening', '개막식', 'opening',
       '2026년 5월 15일(금) 19:00',
       '속초 엑스포잔디공장 메인무대',
       '제4회 설악무산문화축전의 개막을 알리는 무대. 식전 공연과 개막 선언으로 축제의 시작을 함께합니다.',
       1
FROM festivals f WHERE f.slug = 'musan'
ON CONFLICT DO NOTHING;

INSERT INTO festival_events (festival_id, slug, name, kind, schedule, venue, description, sort_order)
SELECT f.id, 'closing', '폐막식', 'closing',
       '2026년 5월 17일(일) 19:00',
       '속초 엑스포잔디공장 메인무대',
       '3일간의 축전을 마무리하는 폐막식. 헤드라이너 공연과 시민이 함께하는 피날레로 진행됩니다.',
       99
FROM festivals f WHERE f.slug = 'musan'
ON CONFLICT DO NOTHING;


-- ============================================
-- 시드: musan — festival_guests (스페셜 게스트)
-- ============================================
INSERT INTO festival_guests (festival_id, name, description, sort_order)
SELECT f.id, '카더가든', '국내 대표 싱어송라이터 — 음악 페스티벌 헤드라이너', 1
FROM festivals f WHERE f.slug = 'musan'
ON CONFLICT DO NOTHING;

INSERT INTO festival_guests (festival_id, name, description, sort_order)
SELECT f.id, '소수빈밴드', '강원 기반 인디 밴드 — 폐막식 무대 출연', 2
FROM festivals f WHERE f.slug = 'musan'
ON CONFLICT DO NOTHING;


-- ============================================
-- 시드: food — food_booths (placeholder 3개)
-- 실제 부스 정보는 어드민에서 입력
-- ============================================
INSERT INTO food_booths (festival_id, booth_no, name, description, sort_order)
SELECT f.id, '01', '속초 명물 분식', '오징어순대·아바이순대 등 속초 향토 분식', 1
FROM festivals f WHERE f.slug = 'food'
ON CONFLICT DO NOTHING;

INSERT INTO food_booths (festival_id, booth_no, name, description, sort_order)
SELECT f.id, '02', '강원 산채 한상', '나물밥·산채정식 등 강원 산채 요리', 2
FROM festivals f WHERE f.slug = 'food'
ON CONFLICT DO NOTHING;

INSERT INTO food_booths (festival_id, booth_no, name, description, sort_order)
SELECT f.id, '03', '동해안 회·구이', '제철 회와 직화구이를 한자리에서', 3
FROM festivals f WHERE f.slug = 'food'
ON CONFLICT DO NOTHING;


-- ============================================
-- 시드: food — food_menus (각 부스 placeholder 메뉴 2개씩)
-- ============================================
INSERT INTO food_menus (booth_id, name, price, description, is_signature, sort_order)
SELECT b.id, '오징어순대', 12000, '속초 명물, 한 접시', true, 1
FROM food_booths b
JOIN festivals f ON b.festival_id = f.id
WHERE f.slug = 'food' AND b.booth_no = '01'
ON CONFLICT DO NOTHING;

INSERT INTO food_menus (booth_id, name, price, description, is_signature, sort_order)
SELECT b.id, '아바이순대', 13000, '함경도식 순대', false, 2
FROM food_booths b
JOIN festivals f ON b.festival_id = f.id
WHERE f.slug = 'food' AND b.booth_no = '01'
ON CONFLICT DO NOTHING;

INSERT INTO food_menus (booth_id, name, price, description, is_signature, sort_order)
SELECT b.id, '산채정식', 15000, '나물 8첩 정식', true, 1
FROM food_booths b
JOIN festivals f ON b.festival_id = f.id
WHERE f.slug = 'food' AND b.booth_no = '02'
ON CONFLICT DO NOTHING;

INSERT INTO food_menus (booth_id, name, price, description, is_signature, sort_order)
SELECT b.id, '곤드레밥', 10000, '강원 곤드레 비빔밥', false, 2
FROM food_booths b
JOIN festivals f ON b.festival_id = f.id
WHERE f.slug = 'food' AND b.booth_no = '02'
ON CONFLICT DO NOTHING;

INSERT INTO food_menus (booth_id, name, price, description, is_signature, sort_order)
SELECT b.id, '광어회 한 접시', 25000, '동해 직송 광어회', true, 1
FROM food_booths b
JOIN festivals f ON b.festival_id = f.id
WHERE f.slug = 'food' AND b.booth_no = '03'
ON CONFLICT DO NOTHING;

INSERT INTO food_menus (booth_id, name, price, description, is_signature, sort_order)
SELECT b.id, '직화 가리비구이', 18000, '직화로 구운 가리비 5미', false, 2
FROM food_booths b
JOIN festivals f ON b.festival_id = f.id
WHERE f.slug = 'food' AND b.booth_no = '03'
ON CONFLICT DO NOTHING;
