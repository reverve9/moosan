-- ============================================
-- 2026 설악무산문화축전 — 스키마 생성
-- Supabase SQL Editor에서 실행
-- ============================================

-- ────────────────────────────────────────────
-- Festivals (메인 3개 페이지: 무산 / 음식 / 청소년)
-- 각 페이지의 좌측 포스터, 본문, 테마 컬러를 어드민에서 관리
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS festivals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,                 -- 'musan' | 'food' | 'youth'
  name TEXT NOT NULL,                        -- '제4회 설악청소년문화축전'
  subtitle TEXT,                             -- 'Seorak Youth Festival'
  description_lead TEXT,                     -- 첫 단락 (드롭캡 포함)
  description_body TEXT,                     -- 두 번째 단락
  poster_url TEXT,                           -- 좌측 포스터 (storage path)
  schedule TEXT,                             -- '2026년 5월 15일(금) - 17일(일)'
  venue TEXT,                                -- '속초 엑스포잔디공장 일원'
  theme_color TEXT,                          -- '#FBF1CC' (festival-tint)
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ────────────────────────────────────────────
-- Programs (각 festival 하위 프로그램: 백일장, 사생대회 등)
-- 아코디언 카드: 썸네일 + 행사명 + 설명 / 펼침 시 갤러리 + 정보 + 시상
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  festival_id UUID REFERENCES festivals(id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('writing', 'art', 'dance', 'choir')),
  target_divisions TEXT[] NOT NULL DEFAULT '{}',
  participation_type TEXT NOT NULL DEFAULT 'individual' CHECK (participation_type IN ('individual', 'team', 'both')),
  min_team_size INT,
  max_team_size INT,
  description TEXT,                          -- 1-2줄 카드 설명
  requirements TEXT,
  event_name TEXT,                           -- 행사명 정식 명칭
  schedule TEXT,                             -- 본선일시
  venue TEXT,                                -- 장소
  target_text TEXT,                          -- 참가대상 (디스플레이용)
  awards_text TEXT,                          -- 시상내용 (디스플레이용)
  awards JSONB,                              -- 시상내용 (구조화)
  registration_period TEXT,                  -- 접수기간
  application_method TEXT,                   -- 접수방법
  thumbnail_url TEXT,                        -- 카드 썸네일 (storage path)
  gallery_urls JSONB NOT NULL DEFAULT '[]'::jsonb,  -- 작년 행사 사진 배열
  registration_start TIMESTAMPTZ,
  registration_end TIMESTAMPTZ,
  max_applicants INT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  meta JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ────────────────────────────────────────────
-- 기존 DB 마이그레이션 — programs 테이블에 신규 컬럼 추가
-- (CREATE TABLE IF NOT EXISTS 는 기존 테이블에 컬럼을 추가하지 않으므로 별도 처리)
-- ────────────────────────────────────────────
ALTER TABLE programs ADD COLUMN IF NOT EXISTS festival_id UUID REFERENCES festivals(id) ON DELETE CASCADE;
ALTER TABLE programs ADD COLUMN IF NOT EXISTS application_method TEXT;
ALTER TABLE programs ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
ALTER TABLE programs ADD COLUMN IF NOT EXISTS gallery_urls JSONB NOT NULL DEFAULT '[]'::jsonb;

-- 어드민 디스플레이용 텍스트 필드
ALTER TABLE programs ADD COLUMN IF NOT EXISTS event_name TEXT;             -- 행사명 정식 명칭
ALTER TABLE programs ADD COLUMN IF NOT EXISTS target_text TEXT;            -- 참가대상 (디스플레이용)
ALTER TABLE programs ADD COLUMN IF NOT EXISTS awards_text TEXT;            -- 시상내용 (디스플레이용)
ALTER TABLE programs ADD COLUMN IF NOT EXISTS registration_period TEXT;    -- 접수기간

-- ────────────────────────────────────────────
-- Applications (참가신청)
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  division TEXT NOT NULL DEFAULT '',
  participation_type TEXT NOT NULL DEFAULT 'individual' CHECK (participation_type IN ('individual', 'team')),
  team_name TEXT,
  applicant_name TEXT NOT NULL,
  applicant_birth TEXT,
  school_name TEXT NOT NULL DEFAULT '',
  school_grade TEXT,
  phone TEXT NOT NULL,
  email TEXT,
  parent_name TEXT,
  parent_phone TEXT,
  parent_relation TEXT,
  teacher_name TEXT,
  teacher_phone TEXT,
  teacher_email TEXT,
  teacher_subject TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled', 'waitlist')),
  admin_memo TEXT,
  rejection_reason TEXT,
  privacy_agreed BOOLEAN NOT NULL DEFAULT false,
  privacy_agreed_at TIMESTAMPTZ,
  meta JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ────────────────────────────────────────────
-- Participants (단체 참가 시 팀원)
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  birth TEXT,
  school_name TEXT,
  school_grade TEXT,
  role TEXT,
  is_leader BOOLEAN NOT NULL DEFAULT false,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ────────────────────────────────────────────
-- Notices (공지사항)
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general' CHECK (category IN ('general', 'program', 'result')),
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  is_published BOOLEAN NOT NULL DEFAULT false,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ────────────────────────────────────────────
-- updated_at 자동 갱신 트리거
-- ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_festivals_updated_at ON festivals;
CREATE TRIGGER trg_festivals_updated_at
  BEFORE UPDATE ON festivals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_programs_updated_at ON programs;
CREATE TRIGGER trg_programs_updated_at
  BEFORE UPDATE ON programs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_applications_updated_at ON applications;
CREATE TRIGGER trg_applications_updated_at
  BEFORE UPDATE ON applications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_notices_updated_at ON notices;
CREATE TRIGGER trg_notices_updated_at
  BEFORE UPDATE ON notices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ────────────────────────────────────────────
-- 인덱스
-- ────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_programs_festival_id ON programs(festival_id);
CREATE INDEX IF NOT EXISTS idx_programs_sort_order ON programs(sort_order);
CREATE INDEX IF NOT EXISTS idx_applications_program_id ON applications(program_id);
CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);
CREATE INDEX IF NOT EXISTS idx_applications_created_at ON applications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_participants_application_id ON participants(application_id);

-- ────────────────────────────────────────────
-- RLS 활성화
-- ────────────────────────────────────────────
ALTER TABLE festivals ENABLE ROW LEVEL SECURITY;
ALTER TABLE programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE notices ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────
-- RLS 정책: 누구나 읽기 (anon)
-- ────────────────────────────────────────────
DROP POLICY IF EXISTS "festivals_select" ON festivals;
CREATE POLICY "festivals_select" ON festivals FOR SELECT USING (true);

DROP POLICY IF EXISTS "programs_select" ON programs;
CREATE POLICY "programs_select" ON programs FOR SELECT USING (true);

DROP POLICY IF EXISTS "applications_select" ON applications;
CREATE POLICY "applications_select" ON applications FOR SELECT USING (true);

DROP POLICY IF EXISTS "participants_select" ON participants;
CREATE POLICY "participants_select" ON participants FOR SELECT USING (true);

DROP POLICY IF EXISTS "notices_select" ON notices;
CREATE POLICY "notices_select" ON notices FOR SELECT USING (true);

-- ────────────────────────────────────────────
-- RLS 정책: 누구나 신청 가능 (anon insert)
-- ────────────────────────────────────────────
DROP POLICY IF EXISTS "applications_insert" ON applications;
CREATE POLICY "applications_insert" ON applications FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "participants_insert" ON participants;
CREATE POLICY "participants_insert" ON participants FOR INSERT WITH CHECK (true);

-- ────────────────────────────────────────────
-- RLS 정책: 임시 — 추후 Auth 연동 시 admin만 허용
-- ────────────────────────────────────────────
DROP POLICY IF EXISTS "festivals_all" ON festivals;
CREATE POLICY "festivals_all" ON festivals FOR ALL USING (true);

DROP POLICY IF EXISTS "programs_all" ON programs;
CREATE POLICY "programs_all" ON programs FOR ALL USING (true);

DROP POLICY IF EXISTS "applications_update" ON applications;
CREATE POLICY "applications_update" ON applications FOR UPDATE USING (true);

DROP POLICY IF EXISTS "notices_all" ON notices;
CREATE POLICY "notices_all" ON notices FOR ALL USING (true);
