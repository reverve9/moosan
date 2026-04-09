-- ============================================================================
-- 15_surveys.sql
-- 2026 설악무산문화축전 — 만족도 조사 설문 폼
-- ============================================================================
--
-- 개요
--  · 주관기관 확정 네이버 폼(20 대문항 + 서브문항 ≈ 35 질문) 디지털화.
--  · 기본 정보(성별/연령/거주/이름/연락처/동의)는 개별 컬럼으로 저장.
--  · Q1~Q20 응답은 answers JSONB 로 저장 (스키마 변화 유연).
--  · 같은 phone + festival_id 조합은 중복 제출 차단 (unique 인덱스).
--  · 쿠폰 자동 발급은 다음 세션. 이번엔 설문 저장까지만.
--
-- Realtime
--  · 어드민 설문 통계(핸드오프 6.E) 대비해 publication 등록 + REPLICA IDENTITY.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) surveys 테이블
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS surveys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  festival_id UUID REFERENCES festivals(id) ON DELETE SET NULL,

  -- 기본 정보
  gender TEXT NOT NULL CHECK (gender IN ('male', 'female')),
  age INTEGER NOT NULL CHECK (age > 0 AND age < 150),
  region TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  privacy_consented BOOLEAN NOT NULL DEFAULT false,

  -- 응답 (Q1~Q20, 서브문항 포함 JSONB)
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- 메타
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 같은 phone + festival 조합 1회 제출만 허용
CREATE UNIQUE INDEX IF NOT EXISTS idx_surveys_phone_festival
  ON surveys(phone, festival_id);
CREATE INDEX IF NOT EXISTS idx_surveys_festival_id
  ON surveys(festival_id);
CREATE INDEX IF NOT EXISTS idx_surveys_created_at
  ON surveys(created_at DESC);

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION set_updated_at_surveys()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_surveys_updated_at ON surveys;
CREATE TRIGGER trg_surveys_updated_at
  BEFORE UPDATE ON surveys
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_surveys();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Realtime publication + REPLICA IDENTITY FULL
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'surveys'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE surveys;
  END IF;
END
$$;

ALTER TABLE surveys REPLICA IDENTITY FULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) RLS — 프로젝트 전반이 anon key + 클라이언트 직접 쓰기 패턴이라
--    다른 테이블들과 동일하게 RLS 비활성.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE surveys DISABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 적용 후 검증 쿼리
--
--   SELECT column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--   WHERE table_name = 'surveys' ORDER BY ordinal_position;
--
--   SELECT indexname, indexdef FROM pg_indexes
--   WHERE tablename = 'surveys';
-- ============================================================================
