-- ============================================================================
-- 13_booth_status.sql
-- food_booths 에 영업 상태 / 준비 중 토글 컬럼 추가
-- ============================================================================
--
-- 운영 중 부스가 세 가지 상태를 토글:
--   · 영업 중      : is_open = true,  is_paused = false  (기본)
--   · 준비 중       : is_open = true,  is_paused = true   (잠시 주문 받지 않음)
--   · 영업 종료     : is_open = false                      (하루 마감)
--
-- 클라이언트(손님) 앱은 두 플래그를 보고 부스 카드/주문 버튼을 비활성화한다.
-- ============================================================================

ALTER TABLE food_booths
  ADD COLUMN IF NOT EXISTS is_open BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_paused BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN food_booths.is_open IS
  '영업 상태. false 면 완전 영업종료(하루 마감). 부스 대시보드 토글로 제어.';
COMMENT ON COLUMN food_booths.is_paused IS
  '일시 준비 중. true 면 영업 중이지만 잠시 주문 받지 않음. 부스 대시보드 토글로 제어.';

-- Realtime publication 에 food_booths 추가 (없으면 추가)
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE food_booths;
  EXCEPTION WHEN duplicate_object THEN
    -- 이미 등록돼 있으면 무시
    NULL;
  END;
END $$;

-- Realtime 필터가 non-PK 컬럼에서도 정상 동작하도록
ALTER TABLE food_booths REPLICA IDENTITY FULL;
