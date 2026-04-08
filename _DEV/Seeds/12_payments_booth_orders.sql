-- ============================================================================
-- 12_payments_booth_orders.sql
-- 음식문화페스티벌 — 결제/주문 모델 재설계 (푸드코트형)
-- ============================================================================
--
-- 변경 요약
--  · 기존: 1 Toss 결제 = 1 orders row (여러 부스 섞임) + N order_items
--  · 신규: 1 Toss 결제 = 1 payments row + N orders rows (부스별)
--          각 orders 에 order_items 가 연결됨. order_number 는 부스별 누적
--          카운터 기반으로 발급 (DELETE 해도 감소하지 않음).
--
-- 주문번호 포맷: {booth_no}-{MMDD}-{0001}
--   예) A01-0428-0001  ← A01 부스가 오늘 받은 1번째 주문
--
-- Toss orderId 포맷: P-{00000001}
--   전역 sequence 기반. DELETE 영향 없음. Toss 에 보내는 유일 식별자.
--
-- ============================================================================
-- 주의: dev 단계이므로 기존 orders / order_items 의 데이터는 전부 제거된다.
-- 운영 마이그 시엔 별도 데이터 이관 스크립트 필요.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 0) 기존 의존 객체 제거
-- ─────────────────────────────────────────────────────────────────────────────

-- 뷰 먼저 (테이블 참조)
DROP VIEW IF EXISTS booth_waiting_counts;

-- 기존 트리거/함수
DROP TRIGGER IF EXISTS trg_orders_set_number ON orders;
DROP FUNCTION IF EXISTS set_order_number();
DROP FUNCTION IF EXISTS generate_order_number();

-- 기존 테이블 (ON DELETE CASCADE 로 order_items 도 자동 제거)
DROP TABLE IF EXISTS order_items CASCADE;
DROP TABLE IF EXISTS orders CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) payments — 결제 1건 단위
-- ─────────────────────────────────────────────────────────────────────────────

CREATE SEQUENCE IF NOT EXISTS payment_toss_order_seq START 1;

CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  toss_order_id TEXT UNIQUE NOT NULL,
  payment_key TEXT,
  phone TEXT NOT NULL,
  total_amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'cancelled')),
  paid_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  festival_id UUID REFERENCES festivals(id) ON DELETE SET NULL,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_payments_phone_created ON payments (phone, created_at DESC);
CREATE INDEX idx_payments_festival_created ON payments (festival_id, created_at DESC);
CREATE INDEX idx_payments_status ON payments (status);

-- Toss orderId 자동 채우기 (전역 sequence, DELETE 무관)
CREATE OR REPLACE FUNCTION generate_toss_order_id()
RETURNS TEXT AS $$
BEGIN
  RETURN 'P-' || LPAD(nextval('payment_toss_order_seq')::TEXT, 8, '0');
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION set_toss_order_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.toss_order_id IS NULL OR NEW.toss_order_id = '' THEN
    NEW.toss_order_id := generate_toss_order_id();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_payments_set_toss_order_id
  BEFORE INSERT ON payments
  FOR EACH ROW EXECUTE FUNCTION set_toss_order_id();

CREATE TRIGGER trg_payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) booth_order_counters — 부스별 누적 카운터 (DELETE 영향 없음)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE booth_order_counters (
  booth_id UUID PRIMARY KEY REFERENCES food_booths(id) ON DELETE CASCADE,
  last_no INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE booth_order_counters IS
  '부스별 누적 주문 카운터. last_no 는 절대 감소하지 않으며 DELETE FROM orders 도
   영향 없음. 같은 부스 동시 INSERT 는 advisory_xact_lock 으로 직렬화.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) orders — 부스 scope 단위 주문
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  order_number TEXT UNIQUE NOT NULL,
  booth_id UUID REFERENCES food_booths(id) ON DELETE SET NULL,
  booth_no TEXT NOT NULL,
  booth_name TEXT NOT NULL,
  subtotal INTEGER NOT NULL,
  phone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'confirmed', 'completed', 'cancelled')),
  confirmed_at TIMESTAMPTZ,
  ready_at TIMESTAMPTZ,
  festival_id UUID REFERENCES festivals(id) ON DELETE SET NULL,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_orders_payment ON orders (payment_id);
CREATE INDEX idx_orders_booth_status ON orders (booth_id, status);
CREATE INDEX idx_orders_phone_created ON orders (phone, created_at DESC);
CREATE INDEX idx_orders_booth_confirmed ON orders (booth_id, confirmed_at);
CREATE INDEX idx_orders_status ON orders (status);

-- order_number 생성: per-booth advisory lock + counter upsert
CREATE OR REPLACE FUNCTION generate_booth_order_number(
  p_booth_id UUID,
  p_booth_no TEXT
) RETURNS TEXT AS $$
DECLARE
  date_prefix TEXT;
  next_no INT;
BEGIN
  date_prefix := to_char((now() AT TIME ZONE 'Asia/Seoul')::date, 'MMDD');

  -- 같은 부스에 대한 동시 INSERT 직렬화
  PERFORM pg_advisory_xact_lock(hashtext('booth_order_' || p_booth_id::text));

  INSERT INTO booth_order_counters (booth_id, last_no, updated_at)
  VALUES (p_booth_id, 1, now())
  ON CONFLICT (booth_id) DO UPDATE
    SET last_no = booth_order_counters.last_no + 1,
        updated_at = now()
  RETURNING last_no INTO next_no;

  RETURN COALESCE(NULLIF(p_booth_no, ''), 'X')
    || '-' || date_prefix
    || '-' || LPAD(next_no::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION set_booth_order_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.order_number IS NULL OR NEW.order_number = '' THEN
    NEW.order_number := generate_booth_order_number(NEW.booth_id, NEW.booth_no);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_orders_set_number
  BEFORE INSERT ON orders
  FOR EACH ROW EXECUTE FUNCTION set_booth_order_number();

CREATE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) order_items — 순수 라인 아이템 (booth/ready/confirmed 정보 제거)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_id UUID REFERENCES food_menus(id) ON DELETE SET NULL,
  menu_name TEXT NOT NULL,
  menu_price INTEGER NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  subtotal INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_order_items_order ON order_items (order_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) booth_waiting_counts 뷰 재생성 (orders 기준)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW booth_waiting_counts AS
SELECT
  fb.id AS booth_id,
  COALESCE(wc.cnt, 0) AS waiting_count
FROM food_booths fb
LEFT JOIN (
  SELECT
    o.booth_id,
    COUNT(*) AS cnt
  FROM orders o
  WHERE o.status = 'paid'                     -- paid 이고 아직 confirmed 아님
    AND o.confirmed_at IS NULL
    AND o.created_at > now() - INTERVAL '3 hours'
  GROUP BY o.booth_id
) wc ON wc.booth_id = fb.id
WHERE fb.is_active = true;

COMMENT ON VIEW booth_waiting_counts IS
  '부스별 미확인(paid + confirmed_at IS NULL) 주문 건수. 최근 3시간 내, 활성 부스만.';

GRANT SELECT ON booth_waiting_counts TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6) RLS
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE booth_order_counters ENABLE ROW LEVEL SECURITY;

-- payments
CREATE POLICY "payments_select" ON payments FOR SELECT USING (true);
CREATE POLICY "payments_insert" ON payments FOR INSERT WITH CHECK (true);
CREATE POLICY "payments_update" ON payments FOR UPDATE USING (true) WITH CHECK (true);

-- orders
CREATE POLICY "orders_select" ON orders FOR SELECT USING (true);
CREATE POLICY "orders_insert" ON orders FOR INSERT WITH CHECK (true);
CREATE POLICY "orders_update" ON orders FOR UPDATE USING (true) WITH CHECK (true);

-- order_items
CREATE POLICY "order_items_select" ON order_items FOR SELECT USING (true);
CREATE POLICY "order_items_insert" ON order_items FOR INSERT WITH CHECK (true);
CREATE POLICY "order_items_update" ON order_items FOR UPDATE USING (true) WITH CHECK (true);

-- booth_order_counters — 함수 내부에서만 다루지만 anon upsert 필요
CREATE POLICY "booth_order_counters_all" ON booth_order_counters
  FOR ALL USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7) Realtime publication
-- ─────────────────────────────────────────────────────────────────────────────
--
-- 이미 supabase_realtime 에 orders, order_items 가 있을 수 있으니 DROP → ADD
-- 로 안전하게 재등록. payments 는 신규.

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime DROP TABLE orders;
  EXCEPTION WHEN undefined_object OR undefined_table THEN
    -- publication 에 등록돼 있지 않거나 테이블이 없으면 무시
    NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime DROP TABLE order_items;
  EXCEPTION WHEN undefined_object OR undefined_table THEN
    NULL;
  END;
END $$;

ALTER PUBLICATION supabase_realtime ADD TABLE payments;
ALTER PUBLICATION supabase_realtime ADD TABLE orders;
ALTER PUBLICATION supabase_realtime ADD TABLE order_items;

-- Realtime 필터가 non-PK 컬럼 (booth_id, payment_id 등) 에서도 정상 동작하도록
-- REPLICA IDENTITY FULL 설정. 기본 DEFAULT 는 PK 만 포함하므로 UPDATE 이벤트가
-- 필터에 걸리지 않는다.
ALTER TABLE payments REPLICA IDENTITY FULL;
ALTER TABLE orders REPLICA IDENTITY FULL;
ALTER TABLE order_items REPLICA IDENTITY FULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8) 검증 쿼리 (참고)
-- ─────────────────────────────────────────────────────────────────────────────
-- SELECT * FROM booth_order_counters;
-- SELECT toss_order_id, status, total_amount FROM payments ORDER BY created_at DESC LIMIT 5;
-- SELECT order_number, booth_no, status, confirmed_at, ready_at
--   FROM orders ORDER BY created_at DESC LIMIT 10;
-- SELECT * FROM booth_waiting_counts;
