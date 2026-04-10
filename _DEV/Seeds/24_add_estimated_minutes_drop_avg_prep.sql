-- 24: orders.estimated_minutes 추가 + food_booths.avg_prep_minutes 제거
-- 부스 직원이 주문 확인 시 예상 조리시간을 직접 선택 (5/10/15/20/30분)

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS estimated_minutes INTEGER;

ALTER TABLE food_booths
  DROP COLUMN IF EXISTS avg_prep_minutes;
