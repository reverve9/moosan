-- ============================================================================
-- 28_order_number_v2.sql
-- 주문번호 포맷 v2 — booth_no 그대로 + 일자코드(1자) + 일별 카운터(4자)
--
-- 신 포맷: '{booth_no}-{day_code}{NNNN}'
--   예) M01 부스, 5/15 첫 주문   → 'M01-10001'
--       M01 부스, 5/15 27번째    → 'M01-10027'
--       M01 부스, 5/16 첫 주문   → 'M01-20001'  (카운터 일별 리셋)
--       D03 부스, 5/17 152번째   → 'D03-30152'
--
-- 일자코드:
--   festival_start (2026-05-15) 기준 day_offset + 1
--   pre-festival: 0 (예: 5/14 → 0, 5/13 → 0 으로 클램프)
--   day1: 1, day2: 2, day3: 3, day4: 4 ...
--
-- 카운터:
--   부스별 + 일자별 누적 (booth_order_counters 의 PK 를 (booth_id, day_date) 로
--   변경). 매일 0001 부터 다시 시작. 동시 INSERT 는 부스+일자 단위 advisory
--   lock 으로 직렬화.
--
-- 기존 데이터:
--   기존 orders.order_number ('A01-0428-0001' 류) 는 그대로 유지.
--   본 마이그레이션 이후 INSERT 되는 신규 주문부터 신 포맷 적용.
-- ============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) booth_order_counters 재설계 — (booth_id, day_date) PK 로 일별 리셋 지원
--    기존 누적 카운터 row 는 의미가 달라지므로 날려도 무방 (집계는 orders 가
--    원천. counters 는 단지 다음 번호 발급용).
-- ─────────────────────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS booth_order_counters CASCADE;

CREATE TABLE booth_order_counters (
  booth_id UUID NOT NULL REFERENCES food_booths(id) ON DELETE CASCADE,
  day_date DATE NOT NULL,
  last_no INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (booth_id, day_date)
);

COMMENT ON TABLE booth_order_counters IS
  '부스별·일자별 누적 주문 카운터. (booth_id, day_date) 마다 1행. 매일 0001 부터 리셋. 동시 INSERT 는 advisory_xact_lock 으로 직렬화.';

CREATE INDEX idx_booth_order_counters_day ON booth_order_counters (day_date);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) generate_booth_order_number 갈아끼움 — 신 포맷 'M01-10001'
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS generate_booth_order_number(UUID, TEXT);

CREATE OR REPLACE FUNCTION generate_booth_order_number(
  p_booth_id UUID,
  p_booth_no TEXT
) RETURNS TEXT AS $$
DECLARE
  -- 변경 시 이 줄만 수정. 페스티벌 일정이 바뀌면 함수 재생성.
  festival_start DATE := DATE '2026-05-15';
  now_local DATE;
  day_code INT;
  next_no INT;
BEGIN
  now_local := (now() AT TIME ZONE 'Asia/Seoul')::date;
  -- pre-festival 은 0, day1=1, day2=2, ...
  day_code := GREATEST(0, (now_local - festival_start)::int + 1);

  -- 부스+일자 단위 동시 INSERT 직렬화
  PERFORM pg_advisory_xact_lock(
    hashtext('booth_order_' || p_booth_id::text || '_' || now_local::text)
  );

  INSERT INTO booth_order_counters (booth_id, day_date, last_no, updated_at)
  VALUES (p_booth_id, now_local, 1, now())
  ON CONFLICT (booth_id, day_date) DO UPDATE
    SET last_no = booth_order_counters.last_no + 1,
        updated_at = now()
  RETURNING last_no INTO next_no;

  RETURN COALESCE(NULLIF(p_booth_no, ''), 'X')
    || '-' || day_code::TEXT
    || LPAD(next_no::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- 3) 트리거 set_booth_order_number / trg_orders_set_number 는 함수만 교체되면
--    자동으로 신 포맷 적용. 별도 작업 불필요.

-- ─────────────────────────────────────────────────────────────────────────────
-- 검증 쿼리 (실행 후 직접 확인용)
-- ─────────────────────────────────────────────────────────────────────────────
-- SELECT generate_booth_order_number(
--   (SELECT id FROM food_booths LIMIT 1),
--   (SELECT booth_no FROM food_booths LIMIT 1)
-- );
-- SELECT booth_id, day_date, last_no FROM booth_order_counters ORDER BY day_date DESC, booth_id;

COMMIT;
