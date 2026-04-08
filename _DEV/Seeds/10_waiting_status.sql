-- ============================================================================
-- 10_waiting_status.sql
-- 음식문화페스티벌 — 실시간 대기 현황 기능 (v3 핸드오프 프롬프트)
-- ============================================================================
--
-- 변경 내용
-- 1) food_booths.avg_prep_minutes — 매장별 건당 평균 처리 시간 (분), 기본 5분
-- 2) booth_waiting_counts — 매장별 대기(미확인) 주문 건수 집계 뷰
--
-- 적용 후 코드 측에서 사용:
--   - src/lib/waiting.ts 의 calcWaitingInfo() 가 (count, avg_prep_minutes) → label
--   - FoodSections / BoothModal / CheckoutPage 가 부스 카드/모달/결제 직전에
--     이 뷰에서 booth_id 별 waiting_count 를 읽어 표시
--   - Realtime 은 order_items 테이블 변경을 구독해 booth_id 단위로 로컬 갱신
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) food_booths.avg_prep_minutes 컬럼 추가
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE food_booths
  ADD COLUMN IF NOT EXISTS avg_prep_minutes INTEGER NOT NULL DEFAULT 5;

COMMENT ON COLUMN food_booths.avg_prep_minutes IS
  '매장별 건당 평균 처리 시간(분). 어드민에서 설정. 대기 시간 추정 계산에 사용.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) booth_waiting_counts 뷰
-- ─────────────────────────────────────────────────────────────────────────────
--
-- 정의:
--   - 매장별 "확인 대기 중" 인 order_items 의 건수
--   - 확인 대기 = order_items.confirmed_at IS NULL
--   - 부모 orders 가 paid/completed 인 항목만 (pending/cancelled 제외)
--   - 최근 3시간 내 생성 (오래된 미확인 항목 자동 만료)
--   - 모든 활성 부스를 LEFT JOIN 해서 0건 매장도 행으로 노출 (클라이언트 단순화)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW booth_waiting_counts AS
SELECT
  fb.id AS booth_id,
  COALESCE(wc.cnt, 0) AS waiting_count
FROM food_booths fb
LEFT JOIN (
  SELECT
    oi.booth_id,
    COUNT(*) AS cnt
  FROM order_items oi
  JOIN orders o ON o.id = oi.order_id
  WHERE oi.confirmed_at IS NULL
    AND oi.created_at > now() - INTERVAL '3 hours'
    AND o.status IN ('paid', 'completed')
  GROUP BY oi.booth_id
) wc ON wc.booth_id = fb.id
WHERE fb.is_active = true;

COMMENT ON VIEW booth_waiting_counts IS
  '매장별 대기(미확인) order_items 건수. 부모 order 가 paid/completed 이고
   confirmed_at IS NULL 이며 최근 3시간 내 생성된 항목만 카운트. 모든 활성
   부스를 LEFT JOIN 해서 0건도 행으로 노출.';

-- 뷰는 기본적으로 anon 권한이 없음 — 브라우저(클라이언트) 가 직접 SELECT 하려면
-- 명시적 GRANT 필요. 매장 페이지가 anon 으로 fetch 함.
GRANT SELECT ON booth_waiting_counts TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) Realtime publication 확인
-- ─────────────────────────────────────────────────────────────────────────────
--
-- order_items 는 이미 08_orders.sql 에서 supabase_realtime publication 에
-- 추가됨 → 클라이언트가 order_items 변경을 구독하면 됨. 뷰는 직접 구독 불가
-- (Postgres 트리거 / publication 미지원) 이라 클라이언트가 booth_id 단위로
-- 로컬 카운트를 갱신하거나 변경 시 뷰를 다시 SELECT.
-- ─────────────────────────────────────────────────────────────────────────────

-- 검증 쿼리 (참고용 — 실행 안 해도 무방)
-- SELECT * FROM booth_waiting_counts ORDER BY waiting_count DESC;
-- SELECT id, name, avg_prep_minutes FROM food_booths ORDER BY sort_order;
