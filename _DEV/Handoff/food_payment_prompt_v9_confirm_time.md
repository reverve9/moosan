# 주문 확인 버튼 + 조리시간 모니터링 추가

> 기존 프롬프트 v1~v8 에 추가되는 내용

---

## 1. 주문 확인 버튼 → 예상 조리시간 선택 버튼으로 변경

### 변경 개요
기존 "확인" 단일 버튼을 제거하고, 예상 조리시간 버튼 5개로 대체.
버튼 클릭 한 번으로 **주문 확인 + 예상 조리시간 설정** 동시 처리.

### DB 변경

```sql
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS estimated_minutes INTEGER;
```

- `estimated_minutes`: 부스 직원이 선택한 예상 조리시간 (분)
- `confirmed_at`: 기존 유지 — 시간 버튼 클릭 시 동시에 업데이트

### BoothDashboardPage 변경

기존 주문 카드의 "확인" 버튼 제거 → 시간 선택 버튼 5개로 대체:

```
[5분] [10분] [15분] [20분] [30분]
```

**버튼 동작**
```typescript
// 시간 버튼 클릭 시
await supabase
  .from('order_items')
  .update({
    confirmed_at: new Date().toISOString(),
    estimated_minutes: selectedMinutes, // 5, 10, 15, 20, 30
  })
  .eq('id', itemId);
```

**UI 원칙**
- 버튼 5개 가로 배열
- 태블릿 가로 모드 기준 터치 영역 충분히 확보 (최소 높이 48px)
- 확인 전 상태에서만 표시 (confirmed_at = null)
- 확인 후에는 "준비완료" 버튼만 표시 + 예상 시간 표시 ("약 10분")

### 손님 OrderStatusPage 변경

기존 "매장 확인완료 · 준비중" → 예상 시간 포함:

```
매장 확인완료 · 약 10분 후 준비됩니다
```

- `estimated_minutes` 있으면 표시, 없으면 "준비중" 기존 문구 유지

---

## 2. 예상 조리시간 초과 모니터링

### 기준
```
confirmed_at != null          (확인 완료)
AND is_ready = false          (준비완료 미처리)
AND estimated_minutes 있음
AND now() > confirmed_at + estimated_minutes + 1분
```


### AdminAlertContext 변경

`overdueCount` 추가:

```typescript
const overdueCount = useMemo(() => {
  return summaries.filter(s => {
    if (!s.confirmed_at || s.is_ready || !s.estimated_minutes) return false;
    const confirmedAt = new Date(s.confirmed_at).getTime();
    const deadline = confirmedAt + (s.estimated_minutes + 1) * 60 * 1000;
    return now > deadline;
  }).length;
}, [summaries, now]);
```

### AdminMonitor 변경

**스탯 박스** 기존 3개 → 4개:
- 2분 초과 미확인 (빨강)
- 1분 초과 미확인 (주황)
- 총 미확인 (기본)
- **조리시간 초과** (파랑 계열 — 미확인 알림과 시각적 구분)

**부스 카드**: 조리시간 초과 시 "⏰ 조리시간 초과" 배지 (파랑)

**상단 배너**: `overdueCount > 0` 시 파랑 배너 (미확인 빨강 배너와 별개)

### AdminLayout

사이드바 배지에 overdueCount 반영.

---

## 3. `src/types/database.ts` 변경

`order_items`에 추가:
```typescript
estimated_minutes: number | null;
```

---

## 4. 제거

- `food_booths.avg_prep_minutes` 컬럼 참조 코드 제거 (이제 불필요)
- 빌드 검증은 `npm run build`

---

## 5. 부스앱 조리시간 초과 알람

조리시간 초과 시 부스앱에 추가 알람:

```
confirmed_at != null
AND is_ready = false
AND estimated_minutes 있음
AND now() > confirmed_at + estimated_minutes + 2분
```

- `playSound('alarm', 3)` 1회 재생
- 기존 미확인 주문 알람(1분 간격 반복)과 별개로 1회만
- `overdueAlertedIds: Set<string>` 으로 주문별 1회만 울리게 처리

---

## 6. avg_prep_minutes 완전 제거

### DB
```sql
ALTER TABLE food_booths DROP COLUMN IF EXISTS avg_prep_minutes;
```

### 코드 제거 목록
- `AdminFood.tsx` 편집 모달 — "건당 평균 처리 시간" 입력 필드 제거
- `src/lib/waiting.ts` — `calcWaitingInfo` 함수 및 관련 로직 제거
- `FoodSections.tsx` — 대기 현황 배지 계산에서 `avg_prep_minutes` 참조 제거
- `src/types/database.ts` — `food_booths.avg_prep_minutes` 타입 제거

### 대기 현황 배지
`avg_prep_minutes` 제거 후 대기 건수만 표시:
- 대기 0건 → 여유
- 대기 1~3건 → 대기 N건
- 대기 4건 이상 → 혼잡 N건

예상 시간 표시는 제거 (이제 부스 직원이 확인 시 직접 입력하므로)
