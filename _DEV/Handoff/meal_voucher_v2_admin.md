# 식권(meal voucher) 시스템 v2 — 어드민 수동 발급

> v1 (DB 스키마) 완료 후. 이번 페이즈는 어드민 수동 발급 UI 개편.

---

## 1. 작업 범위

기존 어드민 수동 쿠폰 발급 폼을 종류 선택형으로 개편.

**추가할 것:**
- 쿠폰 종류 선택 (할인쿠폰 / 식권)
- 식권 발급 시 대상 카테고리 선택 (참가자/스태프/VIP/기타)
- 식권 발급 시 최소주문액 필드 숨김 (NULL로 저장)
- 같은 전화번호에 N장 발급 (인솔교사 케이스: 11장 등)
- CSV 일괄 업로드
- 발급 결과 리포트 (다운로드 가능)

**유지:**
- 기존 할인쿠폰 발급 흐름 그대로 (default `type='discount'`)
- 만족도 조사 자동 발급 로직 그대로 (변경 없음)

---

## 2. UI 변경

### 2-1. 종류 선택

```
종류: ○ 할인 쿠폰  ○ 식권
```

**할인 쿠폰 선택 시 (기존 폼 + 발급 사유 추가)**
- 금액 입력
- 최소주문액 입력
- 발급 사유: `manual_compensation` (민원 보상) / `manual_external` (외부업체 의뢰) / `manual_other`
  - source 컬럼에 그대로 저장

**식권 선택 시**
- 액면가 입력 (자유 입력, `amount` 컬럼)
- 최소주문액 필드 **숨김** (NULL로 저장)
- 대상: `voucher_participant` (참가자) / `voucher_staff` (스태프) / `voucher_vip` (VIP) / `voucher_other` (기타)
  - source 컬럼에 그대로 저장

### 2-2. 발급 대상

```
○ 전화번호 직접 입력 (1장 또는 N장)
○ CSV 일괄 업로드
```

**직접 입력:**
- 전화번호 1개
- 발급 매수 (default 1, 식권은 11장 같은 N장 가능)
- 식권 한 번호에 N장 발급 시 row N개 INSERT (각각 독립 row)

**CSV 업로드 형식:**
```csv
phone,quantity,amount,memo
010-1234-5678,11,8000,세종초 사생대회 인솔교사
010-2345-6789,1,8000,스태프 김OO
010-3456-7890,1,10000,VIP 이OO
```

CSV 파싱은 `papaparse` 또는 기존 프로젝트 사용 라이브러리. 없으면 추가.

### 2-3. 공통 필드

- 만료일: default `2026-05-17 23:59:59` (KST). 변경 가능
- 메모: 자유 입력 (`memo` 컬럼)
- batch_id: CSV 업로드 시 자동 생성 (예: `csv_2026-05-04T15:30:00_<uuid>`)
- issued_by: 현재 로그인 운영진 ID

### 2-4. 발급 결과 리포트

CSV 업로드 후 결과 화면:
```
총 처리: 50건
성공:    47건 (47장 발급)
실패:     3건
  - 010-INVALID (전화번호 형식 오류)
  - 010-2345 (전화번호 자릿수 부족)
  - amount 값 없음 (3행)
```

성공/실패 결과를 CSV 다운로드 버튼으로 export.

---

## 3. 데이터 처리 로직

### 3-1. 직접 입력 (N장 발급)

```typescript
// 인솔교사 11장 케이스
const rows = Array.from({ length: quantity }, () => ({
  phone,
  amount,
  type: 'meal_voucher',
  source: 'voucher_participant',
  min_order_amount: null,  // 식권은 NULL
  expires_at: '2026-05-17T23:59:59+09:00',
  issued_by: currentUserId,
  memo,
}));
await supabase.from('coupons').insert(rows);
```

### 3-2. CSV 업로드

```typescript
const batchId = `csv_${new Date().toISOString()}_${crypto.randomUUID()}`;

const rows = csvData.flatMap((row) => {
  // 전화번호 정규화 (010-1234-5678 → 01012345678)
  const phone = normalizePhone(row.phone);
  if (!phone) return []; // 실패 row는 스킵, 별도 리포트
  
  return Array.from({ length: row.quantity }, () => ({
    phone,
    amount: row.amount,
    type: 'meal_voucher',
    source: selectedSource,  // UI에서 선택
    min_order_amount: null,
    expires_at,
    issued_by: currentUserId,
    batch_id: batchId,
    memo: row.memo,
  }));
});

await supabase.from('coupons').insert(rows);
```

### 3-3. 검증

- 전화번호 형식: 한국 휴대폰 (010-XXXX-XXXX 또는 01XXXXXXXXX)
- amount: 양의 정수, 100원 단위
- quantity: 1~50 사이 (CSV 한 row 최대 50장 — 실수 방지)
- 만료일: 미래 날짜만

---

## 4. 확정 사항 (질문 금지)

| Q | 결정 |
|---|---|
| 식권 액면가 | 자유 입력 (어드민에서 매번 정함) |
| 1번호 N장 | 식권은 무제한 허용. 같은 row를 N개 INSERT |
| 만료 기본값 | 2026-05-17 23:59:59 KST. 발급 시 변경 가능 |
| 최소주문액 | 식권은 NULL, 할인쿠폰은 입력값 |
| source 분류 | v1 enum 7개 그대로 사용 |
| CSV 한 row 최대 quantity | 50장 (실수 방지) |
| 발급 매수 한도 | 별도 한도 없음 (UI에서 50장 초과 시 경고 정도) |
| 자동 발급 로직 | 변경 없음. 기존 그대로 |

---

## 5. 검증 절차 — 작업 완료 후 사용자 실행

### 5-1. UI 점검

- [ ] 어드민 발급 폼 → 종류 라디오 버튼 노출
- [ ] 할인쿠폰 선택 → 최소주문액 필드 노출, 발급 사유 3개 라디오
- [ ] 식권 선택 → 최소주문액 필드 숨김, 대상 4개 라디오
- [ ] 직접 입력 → 전화번호 + 매수 (식권만 1 초과 가능)
- [ ] CSV 업로드 → 파일 선택 → 미리보기 → 발급 실행
- [ ] 발급 결과 리포트 → 성공/실패 카운트 + CSV 다운로드

### 5-2. DB 확인 SQL

```sql
-- 식권 직접 입력 (인솔교사 11장 케이스 테스트 후)
SELECT phone, type, source, amount, min_order_amount, COUNT(*) AS issued
FROM coupons
WHERE phone = '01012345678' AND type = 'meal_voucher'
GROUP BY phone, type, source, amount, min_order_amount;
-- 기대: cnt = 11, min_order_amount = NULL

-- CSV 업로드 batch_id 추적
SELECT batch_id, COUNT(*) AS issued, SUM(amount) AS total_amount
FROM coupons
WHERE batch_id IS NOT NULL
GROUP BY batch_id
ORDER BY batch_id DESC
LIMIT 5;

-- source별 분포
SELECT type, source, COUNT(*) AS cnt
FROM coupons
GROUP BY type, source
ORDER BY type, cnt DESC;
```

### 5-3. 엣지 케이스

- [ ] 식권 1장 발급 → row 1개 INSERT, source='voucher_*', min_order_amount=NULL
- [ ] 식권 11장 발급 → row 11개 INSERT, 모두 같은 phone
- [ ] CSV 50건 업로드 → 50건 INSERT, batch_id 1개
- [ ] CSV에 형식 오류 row 포함 → 정상 row만 INSERT, 오류 row는 리포트
- [ ] 할인쿠폰 발급 → 기존 동작 그대로 (type='discount', min_order_amount 값 들어감)

---

## 6. 빌드 검증

`npx tsc --noEmit` 통과 확인.

---

## 7. 커밋

```
feat(coupon): admin manual issuance with meal voucher support

- Add type/source selector (discount vs meal_voucher)
- Hide min_order_amount for meal vouchers
- Support N-quantity issuance per phone (insolence teacher case)
- Add CSV bulk upload with batch_id tracking
- Add issuance result report with CSV download
```

dev push 까지.

---

## 8. 다음 페이즈 예고

- **v3**: 결제 로직 (1결제 1쿠폰 enforcement, 식권 사용 처리, voucher_consumed/burned 계산, 매장 정산 분기)
- **v4**: 통계 화면 (식권 발급/사용/소멸/운영자부담 분리, source별 분리)
