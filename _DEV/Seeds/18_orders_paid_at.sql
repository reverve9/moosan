-- ============================================================================
-- 18_orders_paid_at.sql
-- orders 에 paid_at 컬럼 추가 (대기시간 측정 기준 정정)
-- ============================================================================
--
-- 배경
--  부스 대시보드 / 어드민 모니터의 elapsed (1분 alert) 가 orders.created_at
--  기준이라, 사용자가 "결제하기" 를 누른 직후부터 측정됐다. 결제수단 선택 /
--  본인 인증 / 토스 승인까지 30~40초가 elapsed 에 포함되어, 부스에 도달했을
--  때 이미 alert 직전 (남은 시간 약 20초) 인 케이스가 발생.
--
-- 해결
--  orders 에 paid_at 컬럼 신설 → markPaymentPaid 가 status='paid' 와 함께
--  채움. 부스/어드민의 elapsed 계산은 paid_at 기준으로 전환.
--
-- 변경 요약
--  · orders.paid_at TIMESTAMPTZ NULL 추가
--  · 기존 paid/confirmed/completed/cancelled 행 backfill: payments.paid_at 복사
--  · 인덱스 (paid_at IS NOT NULL) 추가 — KST 당일 paid 조회용
--
-- ============================================================================

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

COMMENT ON COLUMN orders.paid_at IS
  '결제 승인 완료 시각 (= payments.paid_at 와 동일 시점). 부스/어드민 elapsed 계산의 기준. pending 상태 row 는 NULL.';

-- ─── Backfill: 기존 paid 이력 행을 payments.paid_at 으로 채움 ─────────────
UPDATE orders o
SET paid_at = p.paid_at
FROM payments p
WHERE o.payment_id = p.id
  AND o.paid_at IS NULL
  AND p.paid_at IS NOT NULL;

-- ─── 인덱스 ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_orders_paid_at
  ON orders (paid_at)
  WHERE paid_at IS NOT NULL;
