-- ============================================
-- 음식문화페스티벌 주문/결제 시스템 (Phase 1A)
-- 테이블: orders / order_items / booth_accounts
-- 01_schema.sql 의 update_updated_at() 트리거 함수 의존
-- ============================================

-- ──── 1) 주문 헤더 ────
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT UNIQUE NOT NULL,
  phone TEXT NOT NULL,
  total_amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'completed', 'cancelled')),
  payment_key TEXT,
  paid_at TIMESTAMPTZ,
  festival_id UUID REFERENCES festivals(id) ON DELETE SET NULL,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_festival_created
  ON orders (festival_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_phone_created
  ON orders (phone, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status
  ON orders (status);

-- ──── 2) 주문 아이템 (부스별 정산 단위) ────
CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  booth_id UUID REFERENCES food_booths(id) ON DELETE SET NULL,
  menu_id UUID REFERENCES food_menus(id) ON DELETE SET NULL,
  -- 스냅샷 (메뉴/부스가 삭제·수정돼도 정산 데이터는 보존)
  booth_name TEXT NOT NULL,
  menu_name TEXT NOT NULL,
  menu_price INTEGER NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  subtotal INTEGER NOT NULL,
  is_ready BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_items_order
  ON order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_booth_ready
  ON order_items (booth_id, is_ready);

-- ──── 3) 부스 직원 계정 ────
CREATE TABLE IF NOT EXISTS booth_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booth_id UUID NOT NULL REFERENCES food_booths(id) ON DELETE CASCADE,
  login_id TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL, -- bcrypt
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_booth_accounts_booth
  ON booth_accounts (booth_id);

-- ──── 4) updated_at 자동 갱신 트리거 ────
DROP TRIGGER IF EXISTS trg_orders_updated_at ON orders;
CREATE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_booth_accounts_updated_at ON booth_accounts;
CREATE TRIGGER trg_booth_accounts_updated_at
  BEFORE UPDATE ON booth_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ──── 5) order_number 생성 함수 ────
-- 형식: F-YYMMDD-NNNN (KST 기준)
-- 동시성: pg_advisory_xact_lock 으로 같은 날짜 내 INSERT 직렬화
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TEXT AS $$
DECLARE
  date_prefix TEXT;
  next_num INT;
BEGIN
  date_prefix := to_char((now() AT TIME ZONE 'Asia/Seoul')::date, 'YYMMDD');
  -- 같은 날짜에 대한 advisory lock (해시 기반)
  PERFORM pg_advisory_xact_lock(hashtext('order_number_' || date_prefix));
  SELECT COALESCE(MAX(CAST(split_part(order_number, '-', 3) AS INT)), 0) + 1
    INTO next_num
    FROM orders
    WHERE order_number LIKE 'F-' || date_prefix || '-%';
  RETURN 'F-' || date_prefix || '-' || LPAD(next_num::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- ──── 6) order_number 자동 채우기 트리거 ────
CREATE OR REPLACE FUNCTION set_order_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.order_number IS NULL OR NEW.order_number = '' THEN
    NEW.order_number := generate_order_number();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_orders_set_number ON orders;
CREATE TRIGGER trg_orders_set_number
  BEFORE INSERT ON orders
  FOR EACH ROW EXECUTE FUNCTION set_order_number();

-- ──── 7) RLS 활성화 ────
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE booth_accounts ENABLE ROW LEVEL SECURITY;

-- ──── 8) RLS 정책 ────
-- 주문/주문아이템: 단일 행사 운영 한정 정책 (anon select/insert/update 허용).
-- booth_accounts: select 만 anon 허용 (login_id 로 조회 후 클라이언트 bcrypt 검증).
-- 추후 Supabase Auth 도입 시 강화 예정.

-- orders
DROP POLICY IF EXISTS "orders_select" ON orders;
CREATE POLICY "orders_select" ON orders FOR SELECT USING (true);

DROP POLICY IF EXISTS "orders_insert" ON orders;
CREATE POLICY "orders_insert" ON orders FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "orders_update" ON orders;
CREATE POLICY "orders_update" ON orders FOR UPDATE USING (true) WITH CHECK (true);

-- order_items
DROP POLICY IF EXISTS "order_items_select" ON order_items;
CREATE POLICY "order_items_select" ON order_items FOR SELECT USING (true);

DROP POLICY IF EXISTS "order_items_insert" ON order_items;
CREATE POLICY "order_items_insert" ON order_items FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "order_items_update" ON order_items;
CREATE POLICY "order_items_update" ON order_items FOR UPDATE USING (true) WITH CHECK (true);

-- booth_accounts (select 만 — 어드민 CRUD 는 admin 영역에서 service_role 사용 권장,
-- 단기 운영을 위해 임시로 anon all 허용. 어드민 페이지 외에서 접근 못 하게 UI 가드.)
DROP POLICY IF EXISTS "booth_accounts_all" ON booth_accounts;
CREATE POLICY "booth_accounts_all" ON booth_accounts FOR ALL USING (true) WITH CHECK (true);

-- ──── 9) Realtime 활성화 (수동 안내) ────
-- Supabase Studio → Database → Replication → supabase_realtime publication 에
-- 다음 테이블 추가 필요:
--   - orders
--   - order_items
-- (CLI/SQL 으로도 가능: ALTER PUBLICATION supabase_realtime ADD TABLE orders, order_items;)
ALTER PUBLICATION supabase_realtime ADD TABLE orders;
ALTER PUBLICATION supabase_realtime ADD TABLE order_items;
