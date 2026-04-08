-- ============================================================================
-- 14_coupons.sql
-- 음식문화페스티벌 — 쿠폰 (설문/수동 발급 기반, 번호 입력 방식)
-- ============================================================================
--
-- 개요
--  · 로그인 기반이 아니므로 "쿠폰함" 없음. 발급 시 유일한 CODE 를 만들어
--    손님에게 문자/수동 전달하고, 결제 페이지에서 번호 입력 → 차감 결제.
--  · 1 결제당 최대 1 쿠폰 사용.
--  · 할인 방식: 고정 금액 (discount_amount). 최소 주문 금액 조건 있음
--    (default 10,000원).
--  · 상태: active(사용가능) → used(사용완료). 만료는 쿼리 시점에 판정.
--
-- 무결성
--  · payments 에 coupon_id + discount_amount 컬럼 추가.
--  · 결제 성공 시 payments.status='paid' 로 전이하면서 쿠폰을 used 로 원자
--    전이 (UPDATE ... WHERE status='active' RETURNING). 이미 used 면 결제
--    confirm 단계에서 감지 가능. 이 규약은 orders.ts markPaymentPaid 에서
--    enforce.
--
-- Realtime
--  · 쿠폰 상태 변경을 구독할 곳은 당장 없지만, 나중 어드민 실시간 반영을
--    대비해 publication 에 등록 + REPLICA IDENTITY FULL 로 통일.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) coupons 테이블
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  discount_amount INTEGER NOT NULL CHECK (discount_amount > 0),
  min_order_amount INTEGER NOT NULL DEFAULT 10000 CHECK (min_order_amount >= 0),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'used')),
  issued_source TEXT NOT NULL DEFAULT 'manual'
    CHECK (issued_source IN ('manual', 'survey')),
  issued_phone TEXT,
  note TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  used_payment_id UUID,
  festival_id UUID REFERENCES festivals(id) ON DELETE SET NULL,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coupons_status ON coupons(status);
CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code);
CREATE INDEX IF NOT EXISTS idx_coupons_issued_source ON coupons(issued_source);
CREATE INDEX IF NOT EXISTS idx_coupons_expires_at ON coupons(expires_at);

-- updated_at 자동 갱신
CREATE OR REPLACE FUNCTION set_updated_at_coupons()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_coupons_updated_at ON coupons;
CREATE TRIGGER trg_coupons_updated_at
  BEFORE UPDATE ON coupons
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_coupons();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) payments — coupon_id + discount_amount 컬럼 추가
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS coupon_id UUID REFERENCES coupons(id) ON DELETE SET NULL;

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS discount_amount INTEGER NOT NULL DEFAULT 0
    CHECK (discount_amount >= 0);

CREATE INDEX IF NOT EXISTS idx_payments_coupon_id ON payments(coupon_id);

-- coupons.used_payment_id 는 payments 생성 후라야 FK 연결 가능
ALTER TABLE coupons
  DROP CONSTRAINT IF EXISTS coupons_used_payment_id_fkey;
ALTER TABLE coupons
  ADD CONSTRAINT coupons_used_payment_id_fkey
  FOREIGN KEY (used_payment_id) REFERENCES payments(id) ON DELETE SET NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) Realtime publication + REPLICA IDENTITY FULL
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'coupons'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE coupons;
  END IF;
END
$$;

ALTER TABLE coupons REPLICA IDENTITY FULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) RLS — 프로젝트 전반이 anon key + 클라이언트 직접 쓰기 패턴이라
--    다른 테이블들과 동일하게 RLS 비활성.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE coupons DISABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 적용 후 검증 쿼리
--
--   SELECT column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--   WHERE table_name = 'coupons' ORDER BY ordinal_position;
--
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'payments'
--     AND column_name IN ('coupon_id', 'discount_amount');
-- ============================================================================
