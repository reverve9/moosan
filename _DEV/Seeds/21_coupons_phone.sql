-- ============================================================================
-- 21_coupons_phone.sql
-- 쿠폰 전화번호 연결 — 설문조사 자동 쿠폰 발급 시스템
-- ============================================================================
--
-- 배경
--  · 세션 18: 만족도조사 응답자에게 자동 쿠폰 발급 후, 체크아웃에서
--    전화번호 입력만으로 쿠폰 자동 적용.
--  · 기존 issued_phone 컬럼은 수동 발급 기록용 텍스트였고, 조회 인덱스가
--    없어서 전화번호 기반 조회에 부적합.
--
-- 본 마이그레이션
--  · coupons.phone TEXT 컬럼 신규 (normalizePhone 통과한 11자리 숫자)
--  · phone 조회 인덱스 (idx_coupons_phone)
--  · 설문 자동발급 쿠폰은 1 phone 당 1 장 제한 — partial unique index
--    (수동 발급은 중복 허용)
--
-- 정책
--  · 저장 포맷: 하이픈 없음 (src/lib/phone.ts normalizePhone)
--  · 만료: 2026-05-17 23:59:59 KST 하드코딩 (lib/coupons.ts)
--  · 이미 설문 쿠폰 있는 번호 → 재설문 시도 시 unique 위반 → 클라이언트에서
--    catch 해서 "이미 발급됨" 팝업 + 설문 저장 자체 차단 (오염 방지)
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) coupons.phone 컬럼 추가
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE coupons
  ADD COLUMN IF NOT EXISTS phone TEXT;

-- 일반 조회 인덱스 (체크아웃에서 phone 기반 쿠폰 조회)
CREATE INDEX IF NOT EXISTS idx_coupons_phone
  ON coupons(phone);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) 설문 자동발급 1 phone = 1 쿠폰 강제
-- ─────────────────────────────────────────────────────────────────────────────
-- partial unique: issued_source='survey' 이면서 phone 이 같은 row 는 1장만
-- 수동 발급은 WHERE 조건에 걸리지 않으므로 중복 허용

CREATE UNIQUE INDEX IF NOT EXISTS idx_coupons_unique_survey_phone
  ON coupons(phone)
  WHERE issued_source = 'survey' AND phone IS NOT NULL;

-- ============================================================================
-- 검증 쿼리
--
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'coupons' AND column_name = 'phone';
--
--   SELECT indexname FROM pg_indexes
--   WHERE tablename = 'coupons'
--     AND indexname IN ('idx_coupons_phone', 'idx_coupons_unique_survey_phone');
-- ============================================================================
