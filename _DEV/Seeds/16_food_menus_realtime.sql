-- ============================================================================
-- 16_food_menus_realtime.sql
-- food_menus 테이블을 supabase realtime publication 에 추가.
-- ============================================================================
--
-- 부스 대시보드에서 메뉴 품절 토글 시 손님 페이지(FoodSections)가 즉시
-- 반영되도록 한다. 이전에는 publication 에 등록되지 않아서 손님이 새로고침
-- 하기 전까지 품절 메뉴가 정상 노출/결제 가능했다.
--
-- 13_booth_status.sql 에서 food_booths 를 publication 에 추가한 것과 동일한
-- 패턴.
-- ============================================================================

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE food_menus;
  EXCEPTION WHEN duplicate_object THEN
    -- 이미 등록돼 있으면 무시
    NULL;
  END;
END $$;

-- Realtime 필터가 non-PK 컬럼에서도 정상 동작하고 DELETE/UPDATE payload 에
-- old row 전체가 실리도록 REPLICA IDENTITY FULL 설정.
ALTER TABLE food_menus REPLICA IDENTITY FULL;
