# 식권(meal voucher) 시스템 v4 — 통계 + 정산관리 페이지

> v3 (결제 로직) 작업 후. v3 검증은 별도 진행 중. 이번 페이즈는 (1) 어드민 통계 화면에 식권 분리 표시 + (2) **정산관리 신규 페이지** 작성 (사이드바 신설).

---

## 1. 작업 범위

### 1-A. 통계 (StatsRevenueTab) — 식권 분리 표시 추가
- "식권 운영 현황" 신규 섹션 (KPI + source별 분리)
- 기존 "쿠폰" 섹션 → "할인 쿠폰" 라벨 명확화 + source별 분리

### 1-B. 정산관리 (신규 페이지 `/admin/settlement`) — 운영자 송금 정산표
- 사이드바: "매출관리" 아래에 "정산관리" 추가
- 전체 정산 (일별 / 종합) + 매장별 정산 (일별 / 종합) 탭
- Toss 수수료(3.74%) 매장 부담 모델 반영
- 엑셀 export (전체/매장별)

**유지:**
- 기존 매출/주문 통계 그대로
- 기존 자동 쿠폰 통계 그대로

---

## 2. 정산 정책 (확정)

### 2-1. 핵심 룰

| 항목 | 결정 |
|---|---|
| 매장 매출 기준 | `subtotal` (메뉴 정가 합) — 쿠폰/식권/카드 구분 X |
| Toss 수수료 부담 | **매장** 부담 (= subtotal × 3.74%) |
| 수수료 적용 범위 | **모든 매출에 적용** (식권/PG 미경유 거래 포함) |
| 단수처리 | 절사 없음. 소수점 그대로 |
| 환불(`cancelled`) | 정산에서 제외 |
| 일별 그룹 기준 | `payments.paid_at` KST |
| 정산 대상 기간 | 5/15~5/17 본행사 + 테스트 기간 |

### 2-2. 자금 흐름 수식

```
매장 송금       = subtotal × 0.9626          (= subtotal − Toss수수료)
매장 수수료 부담 = subtotal × 0.0374
운영자 PG 입금   = user_paid × 0.9626
운영자 부담      = 쿠폰 차감액 + 식권 사용액   (= subtotal − user_paid)
운영자 순지출    = 매장 송금 − 운영자 PG 입금
                = (subtotal − user_paid) × 0.9626
                ≈ 운영자 부담 × 0.9626
```

### 2-3. 검증 예시

| 케이스 | subtotal | 쿠폰 | 식권 | user_paid | 매장 송금 | PG 입금 | 운영자 순지출 |
|---|---|---|---|---|---|---|---|
| 일반 + 쿠폰 | 10,000 | 2,000 | 0 | 8,000 | 9,626 | 7,700.8 | 1,925.2 |
| 전액 식권 | 8,000 | 0 | 8,000 | 0 | 7,700.8 | 0 | 7,700.8 |
| 부분 식권 | 10,000 | 0 | 8,000 | 2,000 | 9,626 | 1,925.2 | 7,700.8 |
| 일반 카드 | 10,000 | 0 | 0 | 10,000 | 9,626 | 9,626 | 0 |
| 식권 + 쿠폰 | 10,000 | 1,000 | 7,000 | 2,000 | 9,626 | 1,925.2 | 7,700.8 |

확인:
- 일반 카드 거래는 운영자 손익 0 ✓ (수수료 매장 부담)
- 식권/쿠폰 부담분이 그대로 운영자 순지출로 흘러감 ✓
- 전액 식권 = PG 미경유라도 매장이 수수료 부담 → 매장 송금에 반영

---

## 3. 정산관리 페이지 (신규)

### 3-1. 사이드바

기존 라우팅에 "매출관리" 아래로 "정산관리" 추가.

```
- 매출관리 (/admin/revenue)        — 분석/통계
- 정산관리 (/admin/settlement)     — 매장 송금 실무 (NEW)
```

### 3-2. 페이지 레이아웃

```
정산관리
─────────────────────────────────────
[전체 정산]  [매장별 정산]              ← 탭
─────────────────────────────────────
기간 [일별 ▾] [2026-05-15 ▾]  [종합]   ← 모드 + 날짜
─────────────────────────────────────
[ 정산표 / KPI / 표 / 검증 위젯 ]
─────────────────────────────────────
[엑셀 다운로드 (.xlsx)]
```

### 3-3. 전체 정산 탭

**KPI (4~5개):**
- 매장 송금 합계
- 운영자 PG 실입금
- 운영자 순지출
- 운영자 부담 (쿠폰 + 식권)
- 정합성 검증 ✅ / ❌

**일별 모드 — 1행:** 선택 날짜 1일치
**종합 모드 — N행:** 5/15·5/16·5/17 (또는 전 기간) 일별 행 + 합계 행

**컬럼:**
| 날짜 | 주문건수 | 매장매출(subtotal) | 식권사용 | 쿠폰차감 | PG거래액(user_paid) | Toss수수료(subtotal×3.74%) | 매장 송금 | 운영자 PG입금 | 운영자 순지출 |

### 3-4. 매장별 정산 탭

**일별 모드:** 선택 날짜의 매장별 행
**종합 모드:** 전 기간 매장별 행 + 합계

**컬럼:**
| 매장명 | 주문건수 | 매장매출 | 식권사용 | 쿠폰차감 | PG거래액 | Toss수수료 | **매장 송금액** |

매장별 송금액 = 부스별 SUM(subtotal) × 0.9626. 송금 실무용.

### 3-5. 엑셀 export

탭/모드별로 별도 시트 또는 단일 워크북 다중 시트:
- "전체 정산 (일별)"
- "전체 정산 (종합)"
- "매장별 정산 (일별)"
- "매장별 정산 (종합)"

기존 어드민 페이지에서 사용 중인 xlsx 라이브러리 패턴 그대로 차용 (확인: `AdminCoupons.tsx` CSV 로직, `AdminRevenue` export 함수).

### 3-6. 정합성 검증 위젯

```
정산 정합성 검증
  매장 송금 합계      9,626,000원
  운영자 PG 입금      7,700,800원
  운영자 부담 × 0.9626  1,925,200원
  ─────────────────────
  검증식: 매장송금 = PG입금 + 운영자부담×0.9626
                                    ✅ 일치
```

위젯에서 ❌ 불일치 떨어지면 데이터 정합성 문제 — 송금 전 점검.

---

## 4. 통계 (StatsRevenueTab) 추가 섹션

### 4-1. "식권 운영 현황" 신규 섹션

```
식권 운영 현황
─────────────────────────────────────
발급 현황
  총 발급      150장 (1,200,000원)
  사용         127장 (84.7%)
  미사용        23장 (184,000원)

비용 정산
  운영자 식권 부담  954,000원   ← SUM(voucher_consumed)
  소멸 잔액        62,000원   ← SUM(voucher_burned)
  미사용 식권     184,000원

지표
  식권당 평균 사용액  7,512원
  사용률             84.7%

대상별 분리
  참가자 (voucher_participant)  100장 / 사용 88장 / 부담 660,000원
  스태프 (voucher_staff)         40장 / 사용 35장 / 부담 280,000원
  VIP (voucher_vip)              10장 / 사용  4장 / 부담  14,000원
  기타 (voucher_other)            0장
─────────────────────────────────────
```

### 4-2. "할인 쿠폰" 섹션 (기존 라벨 변경 + source 분리)

```
할인 쿠폰
─────────────────────────────────────
  자동 발급 (만족도 — auto_survey)        : N장 / 사용 M장 / 할인 합계
  수동 — 외부업체 (manual_external)        : N장 / 사용 M장 / 할인 합계
  수동 — 민원 보상 (manual_compensation)   : N장 / 사용 M장 / 할인 합계
─────────────────────────────────────
```

### 4-3. 기존 "정산 정합성 검증" 위젯 위치
- 정산관리 페이지로 이동 (실무 안전장치)
- StatsRevenueTab 에는 두지 않음

---

## 5. 데이터 모델 / 쿼리

### 5-1. 정산 페이지용 핵심 쿼리 (SQL 예시)

```sql
-- 일별 전체 정산 (paid_at KST 기준)
SELECT
  DATE_TRUNC('day', p.paid_at AT TIME ZONE 'Asia/Seoul') AS date_kst,
  COUNT(DISTINCT p.id) AS payment_count,
  SUM(o.subtotal)              AS menu_sales,
  SUM(o.voucher_consumed)      AS voucher_used,
  SUM(p.discount_amount)       AS coupon_discount,  -- payments.discount_amount
  SUM(p.total_amount)          AS pg_amount,         -- user_paid 합
  SUM(o.subtotal) * 0.0374     AS toss_fee,
  SUM(o.subtotal) * 0.9626     AS booth_payout,
  SUM(p.total_amount) * 0.9626 AS organizer_pg_in
FROM payments p
JOIN orders   o ON o.payment_id = p.id
WHERE p.status = 'paid'
  AND o.status NOT IN ('cancelled')
GROUP BY date_kst
ORDER BY date_kst;

-- 매장별 정산 (종합)
SELECT
  o.booth_id,
  o.booth_name,
  COUNT(DISTINCT o.id) AS order_count,
  SUM(o.subtotal) AS menu_sales,
  SUM(o.voucher_consumed) AS voucher_used,
  SUM(o.subtotal) * 0.0374 AS toss_fee,
  SUM(o.subtotal) * 0.9626 AS booth_payout
FROM orders o
JOIN payments p ON p.id = o.payment_id
WHERE p.status = 'paid'
  AND o.status NOT IN ('cancelled')
GROUP BY o.booth_id, o.booth_name
ORDER BY booth_payout DESC;
```

### 5-2. 식권 통계 쿼리 (StatsRevenueTab용)

```sql
SELECT
  source,
  COUNT(*) AS issued_count,
  SUM(discount_amount) AS issued_total,
  COUNT(used_at) AS used_count,
  SUM(CASE WHEN used_at IS NOT NULL THEN discount_amount ELSE 0 END) AS used_face_value
FROM coupons
WHERE type = 'meal_voucher'
GROUP BY source
ORDER BY source;
```

---

## 6. UI 컴포넌트 가이드

기존 어드민 페이지에서 패턴 차용:
- 탭: `AdminMonitor` / `AdminFood` 의 탭 구조
- 표/KPI: `StatsRevenueTab` 의 `Kpi` 컴포넌트, `kpiGrid` / `section` 스타일
- 일별 날짜 선택: `AdminSurvey` 의 `dateFrom`/`dateTo` 패턴 확인 후 단일 날짜 picker 적용
- 엑셀 export: `AdminCoupons` 의 xlsx 패턴 (`xlsx` 또는 자체 csv writer)

신규 컴포넌트는 `src/pages/admin/settlement/` 하위에 분리:
- `AdminSettlement.tsx` (페이지 wrapper, AdminRevenue 패턴)
- `SettlementOverallTab.tsx`
- `SettlementByBoothTab.tsx`
- `SettlementSummary.tsx` (KPI + 정합성 검증)
- `lib/settlement.ts` (쿼리 + 정산 계산 로직)

---

## 7. 확정 사항 (질문 금지)

| Q | 결정 |
|---|---|
| 정산 페이지 위치 | 사이드바 "매출관리" 아래 "정산관리" 신규 |
| Toss 수수료 base | subtotal × 3.74% (모든 매출 / 식권 포함) |
| Toss 수수료 부담 주체 | 매장 |
| 수수료 단수처리 | 절사 없음 (소수점 그대로) |
| 환불 처리 | 정산 제외 (status NOT IN ('cancelled')) |
| 일별 기준 시각 | payments.paid_at KST |
| 매장 송금 = | subtotal × 0.9626 |
| 식권 운영 통계 위치 | StatsRevenueTab 신규 섹션 (정산 페이지 X) |
| 정합성 검증 위젯 | 정산관리 페이지에 표시 |
| 엑셀 export | 신규 정산 페이지에 4시트 |

---

## 8. 검증 절차 — 작업 완료 후 사용자 실행

### 8-1. UI 점검 (정산 페이지)
- [ ] 사이드바에 "정산관리" 노출 + 클릭 시 페이지 진입
- [ ] 전체 정산 탭 / 매장별 정산 탭 전환
- [ ] 일별 / 종합 모드 전환
- [ ] 일별 날짜 선택 (5/15, 5/16, 5/17)
- [ ] KPI / 표 / 검증 위젯 정상 노출
- [ ] 엑셀 다운로드 동작 (4시트 포함)

### 8-2. UI 점검 (StatsRevenueTab)
- [ ] "식권 운영 현황" 섹션 노출
- [ ] 4개 source 분리 표시
- [ ] "할인 쿠폰" 라벨 + source별 분리 표시

### 8-3. 데이터 검증

```sql
-- 매장 송금 합계 검증
SELECT SUM(subtotal) * 0.9626 AS booth_payout_total
FROM orders o JOIN payments p ON p.id = o.payment_id
WHERE p.status = 'paid' AND o.status NOT IN ('cancelled');

-- 운영자 순지출 검증
SELECT
  SUM(o.subtotal) * 0.9626        AS booth_payout,
  SUM(p.total_amount) * 0.9626    AS pg_in,
  (SUM(o.subtotal) - SUM(p.total_amount)) * 0.9626 AS organizer_loss
FROM orders o JOIN payments p ON p.id = o.payment_id
WHERE p.status = 'paid' AND o.status NOT IN ('cancelled');

-- 매장별 정산
SELECT booth_name, SUM(subtotal) AS sales, SUM(subtotal) * 0.9626 AS payout
FROM orders WHERE status NOT IN ('cancelled')
GROUP BY booth_id, booth_name ORDER BY payout DESC;

-- 식권 운영 (StatsRevenueTab 검증)
SELECT
  source,
  COUNT(*) AS issued,
  SUM(discount_amount) AS issued_total,
  COUNT(used_at) AS used,
  SUM(CASE WHEN used_at IS NOT NULL THEN discount_amount ELSE 0 END) AS used_value
FROM coupons WHERE type='meal_voucher' GROUP BY source;
```

### 8-4. 엣지 케이스
- [ ] 식권 0장 발급 상태 — 식권 운영 섹션은 노출, 모든 값 0
- [ ] 환불된 주문 — 정산 표에서 제외
- [ ] 다부스 결제 — 매장별 탭에서 부스별 분리 정상
- [ ] 전액 식권 결제 — 매장 송금 = subtotal × 0.9626 그대로 반영
- [ ] 정합성 검증 위젯 ✅ 표시

---

## 9. 빌드 검증

`npx tsc -b --force` 통과 + `npx eslint` 통과.

---

## 10. 커밋

```
feat(settlement): admin settlement page with toss fee deduction

- Add /admin/settlement page (sidebar entry under revenue)
- Overall + per-booth settlement tabs (daily/total modes)
- Toss fee 3.74% applied to all sales (booth-borne)
- Excel export for 4 settlement views
- Add meal voucher operation stats section to revenue tab
- Split discount coupon stats by source
```

dev push 까지.

---

## 11. 식권 시스템 시리즈 종료

v1 (스키마) → v2 (어드민 발급) → v3 (결제) → v4 (통계 + 정산) 4페이즈 완료.

이후 작업 별도 시리즈:
- 환불 시 식권 복구 정책 (운영팀 결정 후)
- 식권 사용 알림 (SMS/카톡)
- 행사 후 자동 정산 보고서 생성/발송
