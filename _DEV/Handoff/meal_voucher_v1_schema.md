# 식권(meal voucher) 시스템 v1 — DB 스키마

> 새 시리즈 시작. 이번 페이즈는 DB 스키마 + 타입만. 어드민/결제/통계는 v2~v4.

---

## 1. 배경

기존 쿠폰은 만족도 조사 자동 발급되는 할인 쿠폰 1종. 이번에 사생대회 참가자/스태프 대상 무료 식권 추가.

| 항목 | 할인 쿠폰 (기존) | 식권 (신규) |
|---|---|---|
| 발급 | 자동(만족도) + 수동 | 수동 전용 |
| 최소 주문액 | 10,000원 | 제약 없음 |
| 액면가 | 2,000원 고정 | 자유 입력 |
| 1번호 발급량 | 1장 | N장 가능 (인솔교사 케이스) |
| 비용 분류 | 마케팅 | 운영 (식대) |

**공통 룰**
- 1결제 1쿠폰 (할인 OR 식권. 식권+식권도 X)
- 사용액만 정산 (잔액 소멸 시 매장도 운영자도 받지 않음)
- 5/17 23:59:59 일괄 만료

**식권 정산 공식**
```
voucher_consumed = min(액면가, 주문금액)
voucher_burned   = 액면가 - voucher_consumed
vendor_settlement = voucher_consumed + user_paid   ← 매장 정산
organizer_cost    = voucher_consumed                ← 운영자 부담
user_paid         = max(0, 주문금액 - 액면가)
```

예시:
- 8,000원 식권 + 6,000원 주문 → 매장 6,000 / 운영자 6,000 / 잔액 2,000 소멸
- 8,000원 식권 + 10,000원 주문 → 매장 10,000 / 운영자 8,000 / 사용자 2,000

---

## 2. DB 변경

### `_DEV/Seeds/27_meal_voucher_schema.sql`

```sql
BEGIN;

-- coupons.type: 쿠폰 종류
ALTER TABLE coupons 
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'discount'
  CHECK (type IN ('discount', 'meal_voucher'));

-- coupons.source: 발급 출처 (회계 분류)
ALTER TABLE coupons 
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'auto_survey'
  CHECK (source IN (
    'auto_survey',
    'manual_compensation',
    'manual_external',
    'voucher_participant',
    'voucher_staff',
    'voucher_vip',
    'voucher_other'
  ));

ALTER TABLE coupons ADD COLUMN IF NOT EXISTS issued_by UUID REFERENCES auth.users(id);
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS batch_id TEXT;
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS memo TEXT;

-- 식권은 최소주문액 제약 없음 → NULLABLE
ALTER TABLE coupons ALTER COLUMN min_order_amount DROP NOT NULL;

-- orders 식권 정산 추적
ALTER TABLE orders 
  ADD COLUMN IF NOT EXISTS voucher_consumed INTEGER DEFAULT 0 CHECK (voucher_consumed >= 0);
ALTER TABLE orders 
  ADD COLUMN IF NOT EXISTS voucher_burned INTEGER DEFAULT 0 CHECK (voucher_burned >= 0);

-- 조회 인덱스
CREATE INDEX IF NOT EXISTS idx_coupons_type_source ON coupons(type, source);
CREATE INDEX IF NOT EXISTS idx_coupons_batch_id ON coupons(batch_id) WHERE batch_id IS NOT NULL;

COMMIT;
```

기존 자동 발급 쿠폰들은 default 로 `type='discount'`, `source='auto_survey'` 자동 마이그레이션. 데이터 손실 없음. idempotent.

> 세션 27 의 카테고리→구역 패턴과 동일 — 테이블/컬럼명 rename 안 하고 컬럼만 추가. 코드 영향 최소화. 운영 후 필요 시 `coupons` → `tickets` rename은 별도 작업.

---

## 3. `src/types/database.ts` 변경

`coupons` Row/Insert/Update 에 추가:
```typescript
type: 'discount' | 'meal_voucher';
source:
  | 'auto_survey'
  | 'manual_compensation'
  | 'manual_external'
  | 'voucher_participant'
  | 'voucher_staff'
  | 'voucher_vip'
  | 'voucher_other';
issued_by: string | null;
batch_id: string | null;
memo: string | null;
min_order_amount: number | null;  // NOT NULL → NULLABLE
```

`orders` Row/Insert/Update 에 추가:
```typescript
voucher_consumed: number;
voucher_burned: number;
```

---

## 4. 확정 사항 (질문 금지)

| Q | 결정 |
|---|---|
| 단일 테이블 vs 분리 | 단일 `coupons` + `type` enum |
| 액면가 결정 | 자유 입력. 기존 `amount` 컬럼 그대로 사용 |
| 1번호 N장 | 식권 허용 (인솔교사 11장 = 학생 10 + 교사 1) |
| 만료 | 5/17 23:59:59. 기존 `expires_at` 컬럼 사용 |
| 최소주문액 | NULLABLE. 식권은 NULL |
| 1결제 1쿠폰 | DB 변경 없음 (기존 `orders.coupon_id` 단일 컬럼 유지). enforcement 는 v3 |
| 기존 데이터 | `type='discount'`, `source='auto_survey'` default 로 자동 마이그레이션 |

---

## 5. 검증 SQL — 작업 완료 후 사용자 실행

```sql
-- 1) 스키마 적용 확인
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'coupons' 
  AND column_name IN ('type', 'source', 'issued_by', 'batch_id', 'memo', 'min_order_amount')
ORDER BY column_name;

-- 2) 기존 데이터 호환성 (전부 discount/auto_survey 인지)
SELECT type, source, COUNT(*) AS cnt
FROM coupons
GROUP BY type, source
ORDER BY cnt DESC;

-- 3) orders 신규 컬럼
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'orders'
  AND column_name IN ('voucher_consumed', 'voucher_burned');

-- 4) 인덱스 확인
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'coupons'
  AND indexname IN ('idx_coupons_type_source', 'idx_coupons_batch_id');
```

---

## 6. 빌드 검증

`npx tsc --noEmit` 통과 확인.

기존 `Coupon` / `Order` 타입 사용처(어드민 발급 폼, 결제 로직 등)에 컴파일 에러 발생 시 **보고만 하고 수정 X**. v2/v3 에서 처리.

---

## 7. 커밋

```
feat(coupon): add meal voucher system DB schema

- Add type/source/issued_by/batch_id/memo columns to coupons
- Make min_order_amount nullable for meal vouchers
- Add voucher_consumed/voucher_burned columns to orders
- Migrate existing coupons to type=discount, source=auto_survey
- Add indexes on (type, source) and (batch_id)
```

dev push 까지. 사용자가 검증 SQL 실행 → 다음 페이즈 진행.

---

## 8. 다음 페이즈 예고

- **v2**: 어드민 수동 발급 폼 (할인쿠폰/식권 종류 선택, CSV 일괄 업로드, 발급 결과 리포트)
- **v3**: 결제 로직 (1결제 1쿠폰 enforcement, 식권 사용 처리, vendor_settlement / organizer_cost 계산)
- **v4**: 통계 화면 (식권 발급/사용/소멸/운영자 부담 분리. 자동쿠폰 vs 식권 분리. source별 분리)
