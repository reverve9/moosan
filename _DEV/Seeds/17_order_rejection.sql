-- ============================================================================
-- 17_order_rejection.sql
-- 부스 단위 주문 거절 + 부분 환불 모델 도입
-- ============================================================================
--
-- 변경 요약
--  · orders 에 거절 이력 컬럼 (cancel_reason / cancelled_at / cancelled_by)
--  · payments 에 누적 환불 금액 (refunded_amount)
--
-- 사용 흐름
--  1) 부스 대시보드에서 paid/confirmed 상태 + ready_at IS NULL 인 주문에 한해
--     거절 가능. 사유 dropdown(재료 소진/조리 불가/손님 요청/기타) + 자유 입력.
--  2) api/orders/cancel.ts 호출 → Toss /v1/payments/{key}/cancel 에 cancelAmount
--     를 부스 subtotal 로 보내 부분 환불. 쿠폰 할인은 운영자(주최) 부담이라
--     영업점은 subtotal 그대로 환불 (비율 분배 아님).
--  3) DB 업데이트:
--      - orders 해당 row: status='cancelled', cancelled_at, cancel_reason,
--        cancelled_by='booth'
--      - payments: refunded_amount += refund_amount
--      - 누적 refunded_amount 가 total_amount 에 도달하면 payments.status='cancelled'
--  4) 어드민 풀환불(api/payments/cancel.ts) 도 부스 거절 이력을 인식하도록 수정
--     (남은 paid orders 만 추가 환불 + 잔액 만큼 cancelAmount).
--
-- ============================================================================

-- ─── orders: 거절 이력 ──────────────────────────────────────────────────────
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS cancelled_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_by  TEXT
    CHECK (cancelled_by IS NULL OR cancelled_by IN ('booth', 'admin'));

COMMENT ON COLUMN orders.cancelled_at IS
  '주문 거절 시각. status=cancelled 로 전이될 때 채움.';
COMMENT ON COLUMN orders.cancel_reason IS
  '거절 사유 (부스/어드민이 입력). 손님 화면에도 표시됨.';
COMMENT ON COLUMN orders.cancelled_by IS
  '거절 주체. booth=부스 대시보드 거절 / admin=어드민 풀환불.';

CREATE INDEX IF NOT EXISTS idx_orders_cancelled_at
  ON orders (cancelled_at)
  WHERE cancelled_at IS NOT NULL;

-- ─── payments: 누적 환불 금액 ──────────────────────────────────────────────
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS refunded_amount INTEGER NOT NULL DEFAULT 0
    CHECK (refunded_amount >= 0);

COMMENT ON COLUMN payments.refunded_amount IS
  '누적 환불 금액. 부분 환불 시마다 += 차감액. total_amount 에 도달하면 payments.status=cancelled 로 전이.';

-- ─── publication / replica identity 점검 ──────────────────────────────────
-- orders / payments 는 12_payments_booth_orders.sql 에서 이미 publication 에
-- 등록됐을 것. 누락된 경우만 추가.
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE orders;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE payments;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

ALTER TABLE orders REPLICA IDENTITY FULL;
ALTER TABLE payments REPLICA IDENTITY FULL;
