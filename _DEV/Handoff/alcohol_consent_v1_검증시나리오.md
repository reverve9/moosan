# 주류 동의 v1 — 검증 시나리오

> 커밋: `f4d6c07` (feat/alcohol)
> Seed: `_DEV/Seeds/33_alcohol_menu.sql`
> 작업 범위: `food_menus.is_alcohol`, `orders.alcohol_consent_at`, 결제 모달, 부스앱 강조, 손님 상태 페이지 안내, 환불 hint

---

## 사전 준비

- [ ] `_DEV/Seeds/33_alcohol_menu.sql` Supabase SQL Editor 실행 → 마지막 검증 쿼리로 컬럼/인덱스 생성 확인
- [ ] dev 환경 또는 prod 빌드 정상 배포 (Vercel)
- [ ] 어드민 (`musanfesta`/`123456`), 손님 PWA, 부스앱 — 3가지 환경 동시 사용 가능 (다른 브라우저/창 권장)
- [ ] 테스트용 매장 1곳 + 일반 메뉴 1개 + 주류 메뉴 1개 등록 가능 상태

---

## 1. 어드민 — 주류 메뉴 등록

### 1-1. 체크박스 노출 + 저장

1. `admin.{도메인}` 접속, `musanfesta` / `123456` 로그인
2. 사이드바 → **참여 매장 관리** 진입
3. 임의 매장 카드 클릭 → 메뉴 편집 모달 오픈
4. 메뉴 1개 선택, 메뉴 행 하단 토글 영역 확인
   - [ ] **`☐ 🍺 주류 메뉴 (성인 인증 필요)`** 체크박스 표시 (기존 `포장 가능` 토글과 같은 줄)
5. 체크박스 ON → `[저장]` 클릭
6. 저장 후 같은 메뉴 행 다시 확인
   - [ ] 메뉴 행 좌측 상단에 빨간 배지 **`🍺 주류`** 노출
   - [ ] 체크박스 상태 ON 유지

### 1-2. 토글 OFF 회귀

1. 같은 메뉴에서 체크박스 OFF → `[저장]`
2. 메뉴 행 확인
   - [ ] 빨간 `🍺 주류` 배지 사라짐

**결과 검증 SQL:**
```sql
SELECT id, name, is_alcohol FROM food_menus WHERE name = '<테스트메뉴명>';
-- is_alcohol = TRUE 확인 (1-1 후) / FALSE 확인 (1-2 후)
```

---

## 2. 손님 결제 — 동의 모달

### 2-1. 일반 메뉴만 결제 — 모달 안 뜸 (회귀)

1. 손님 PWA에서 음식 페이지 진입
2. **일반 메뉴**만 장바구니에 1개 담기
3. `/checkout` 진입, 휴대폰 입력
4. `[결제하기]` 클릭
   - [ ] 동의 모달 노출 X
   - [ ] 즉시 토스 결제창 진입

### 2-2. 주류 메뉴 포함 결제 — 모달 강제 노출

1. 카트 비우고 **주류 메뉴** 1개 + 일반 메뉴 1개 담기
2. `/checkout` 진입, 휴대폰 입력
3. `[결제하기]` 클릭
   - [ ] 동의 모달 등장 (제목 `⚠️ 주류 포함 주문 확인`)
   - [ ] 안내 3줄 표시: 만 19세 미만 / 신분증 제시 / 미제시 시 환불
   - [ ] `☐ 위 사항을 확인하고 동의합니다` 체크박스 + `[취소]` / `[동의하고 결제]` 버튼
4. 체크박스 OFF 상태에서 `[동의하고 결제]` 버튼 hover/클릭
   - [ ] 버튼 disabled 상태 (클릭 무반응)

### 2-3. 취소 흐름

1. 모달 상태에서 `[취소]` 클릭
   - [ ] 모달 닫힘
   - [ ] 토스 결제창 진입 X
   - [ ] 장바구니 유지 (메뉴 그대로)

### 2-4. 동의 후 결제 진행

1. 모달 다시 띄우고 체크박스 ON → `[동의하고 결제]`
   - [ ] 모달 닫힘
   - [ ] 토스 결제창 정상 진입
2. 결제 완료
   - [ ] 주문 상태 페이지 정상 진입

**결과 검증 SQL:**
```sql
SELECT id, alcohol_consent_at, status, booth_name
FROM orders
WHERE alcohol_consent_at IS NOT NULL
ORDER BY created_at DESC
LIMIT 5;
-- 방금 결제건의 모든 부스 row 에 동일 timestamp 기록 확인
```

### 2-5. 다부스 결제 — 모달 1회 + 모든 row 동일 timestamp

1. 카트 비우고 **주류 매장 + 일반 매장** 메뉴 동시에 담기 (booth 2개 이상)
2. 결제 진행
   - [ ] 모달 1회만 노출
3. 결제 완료 후 SQL 확인:
```sql
SELECT payment_id, COUNT(DISTINCT alcohol_consent_at) AS distinct_ts
FROM orders
WHERE alcohol_consent_at IS NOT NULL
  AND payment_id = '<방금결제payment_id>'
GROUP BY payment_id;
-- distinct_ts = 1 이어야 함 (모든 부스 row 동일 timestamp)
```

---

## 3. 부스앱 — 주류 주문 시각 강조 + 준비완료 confirm

### 3-1. 주류 주문 카드 시각 강조

1. 위 **2-4** 또는 **2-5** 결제건이 부스앱(주류 매장 계정)에 도착할 때까지 대기
2. 새 주문 카드 확인
   - [ ] 카드 좌측 보더 **빨간색** (4px)
   - [ ] 카드 상단에 빨간 배너 `🍺 주류 — 신분증 확인 필수`
   - [ ] 주류 메뉴 라인은 메뉴명 옆 `🍺` 아이콘 + 빨간 글씨
   - [ ] 일반 메뉴 라인은 기존 색상 그대로

### 3-2. 일반 매장 카드 — 회귀

1. 일반 매장 부스앱에서 같은 결제(다부스) 또는 별개 일반 결제 카드 확인
   - [ ] 빨간 보더 / 배너 / 빨간 글씨 X (기존 디자인 그대로)

### 3-3. 준비완료 confirm 강제

1. 주류 카드에서 `[조리완료]` 또는 `[준비완료]` 클릭
   - [ ] window.confirm 모달 등장: `이 주문에는 주류가 포함되어 있습니다. 손님 신분증을 확인하셨습니까?`
2. confirm `[취소]` 클릭
   - [ ] 처리 중단, 카드 상태 유지
3. 다시 `[준비완료]` 클릭 → confirm `[확인]`
   - [ ] 정상 처리, 카드 완료 영역으로 이동

### 3-4. 일반 주문 — confirm 안 뜸 (회귀)

1. 일반 주문 카드 `[준비완료]` 클릭
   - [ ] confirm 안 뜨고 즉시 처리

### 3-5. 완료 영역에 빨간 강조 유지

1. 주류 주문이 완료 영역으로 이동 후
   - [ ] 완료 카드도 빨간 좌측 보더 + `🍺 주류` 배지 유지

---

## 4. 손님 주문 상태 페이지 — 신분증 안내

### 4-1. 주류 주문 상태 페이지 안내

1. 위 결제건의 `/order/<id>` 진입
   - [ ] 메타박스 위에 빨간 안내 박스: `🍺 픽업 시 신분증을 반드시 지참해주세요` + 미성년자 환불 안내
   - [ ] 좌측 빨간 보더 (4px)

### 4-2. 부스앱에서 준비완료 처리 후 스트립 강조

1. 부스에서 준비완료 처리되면 손님 페이지에 준비완료 스트립 등장
   - [ ] 스트립 배경 **빨간색** (`#C53030`, 일반 주문은 기본색)
   - [ ] 스트립 본문 아래 추가 라인: `🍺 신분증을 반드시 지참해주세요`
2. 스트립 우측 ✓ 클릭 → dismiss 정상 동작

### 4-3. 일반 주문 회귀

1. 일반 주문(주류 X) 상태 페이지 진입
   - [ ] 빨간 신분증 안내 박스 X (없음)
   - [ ] 준비완료 스트립도 기본 색상

---

## 5. 환불 모달 — 어드민 hint

### 5-1. 주류 주문 환불 모달

1. `admin/orders` → 주류 포함 결제 카드 클릭 → 상세 모달
2. `[매장별 환불]` 섹션 확인
   - [ ] 환불 사유 textarea 위에 hint 박스: `🍺 주류 환불 시: "신분증 미제시"라고 사유 기록 권장 (통계 표준화 목적)`

### 5-2. 일반 주문 회귀

1. 주류 X 결제 상세 모달 → 환불 섹션
   - [ ] 빨간 hint 박스 노출 X

---

## 6. 종합 DB 정합성

```sql
-- (a) 주류 메뉴 등록 현황
SELECT b.name AS booth_name, m.name AS menu_name, m.is_alcohol
FROM food_menus m JOIN food_booths b ON b.id = m.booth_id
WHERE m.is_alcohol = TRUE
ORDER BY b.name, m.sort_order;

-- (b) 동의 timestamp 기록 — 최근 10건
SELECT o.id, o.booth_name, o.alcohol_consent_at, o.status, o.created_at
FROM orders o
WHERE o.alcohol_consent_at IS NOT NULL
ORDER BY o.created_at DESC LIMIT 10;

-- (c) 다부스 결제 시 동일 timestamp 정합 (빈 결과 = OK)
SELECT payment_id, COUNT(DISTINCT alcohol_consent_at) AS distinct_ts
FROM orders
WHERE alcohol_consent_at IS NOT NULL
GROUP BY payment_id
HAVING COUNT(DISTINCT alcohol_consent_at) > 1;

-- (d) 주류 메뉴 부분 인덱스 존재 확인
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'food_menus' AND indexname = 'idx_food_menus_is_alcohol';
```

---

## 통과 기준

- §1 어드민 체크박스 + 배지 ✅
- §2 결제 모달 트리거/취소/동의/다부스 1회 ✅
- §3 부스앱 강조 + 준비완료 confirm ✅
- §4 손님 안내 빨간 라인 + 스트립 ✅
- §5 환불 hint 노출 ✅
- §6 SQL 정합성 (a)~(d) 통과 ✅

전 항목 통과 시 알콜 동의 v1 정상 동작.

---

## 알려진 한계 / 후속 작업 (별도 페이즈)

- 모달/안내 다국어 (영문 손님 케이스)
- PASS 본인인증 연동 (현재 자기신고 + 픽업 시 검증)
- 주류 매출 별도 통계 분리 (현재 일반 매출에 합산)
- 주류 환불 사유 통계 (신분증 미제시 빈도 추적)
