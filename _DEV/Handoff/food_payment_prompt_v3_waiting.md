# 음식문화페스티벌 — 실시간 대기 현황 기능 추가

> 기존 프롬프트 (`food_payment_system_prompt.md`, `food_payment_system_prompt_v2_addon.md`) 에 추가되는 내용

---

## 1. DB 변경

### `food_booths` 컬럼 추가
```sql
ALTER TABLE food_booths
  ADD COLUMN avg_prep_minutes INTEGER NOT NULL DEFAULT 5;
-- 매장별 건당 평균 처리 시간 (분), 어드민에서 설정
```

### 대기 건수 집계 뷰
```sql
CREATE OR REPLACE VIEW booth_waiting_counts AS
SELECT
  booth_id,
  COUNT(*) AS waiting_count
FROM order_items
WHERE confirmed_at IS NULL
  AND created_at > now() - INTERVAL '3 hours'
GROUP BY booth_id;
```

---

## 2. 예상 대기 시간 계산 로직

`src/lib/waiting.ts` 신규

```typescript
export function calcWaitingInfo(
  waitingCount: number,
  avgPrepMinutes: number
): { count: number; estimatedMinutes: number; label: string } {
  const estimatedMinutes = waitingCount * avgPrepMinutes;

  let label = '';
  if (waitingCount === 0) label = '대기 없음';
  else if (estimatedMinutes <= 5) label = '약 5분 이내';
  else if (estimatedMinutes <= 10) label = '약 10분';
  else if (estimatedMinutes <= 20) label = '약 20분';
  else label = `약 ${Math.ceil(estimatedMinutes / 10) * 10}분 이상`;

  return { count: waitingCount, estimatedMinutes, label };
}
```

- 고정값 방식 (행사 기간 단순성 우선)
- `avg_prep_minutes` 는 어드민에서 매장별 설정

---

## 3. FoodSections — 매장 카드 대기 배지

**`src/components/food/FoodSections.tsx`**

매장 카드에 대기 현황 배지 추가:

```
waiting_count === 0  → '여유'    (초록)
waiting_count <= 3   → '대기 N건' (주황)
waiting_count > 3    → '혼잡 N건' (빨강)
```

- 페이지 마운트 시 전체 부스 대기 건수 일괄 fetch
- Supabase Realtime 구독으로 변경 시 해당 부스 카드만 업데이트
- 로딩 중에는 배지 미표시

---

## 4. 매장 상세 모달 — 주문 전 대기 안내

기존 모달 상단에 대기 현황 섹션 추가:

```
현재 대기 현황
대기 주문  3건
예상 시간  약 15분
* 실제 시간은 다를 수 있어요

[메뉴 목록]
[담기 버튼]
```

- 모달 오픈 시 해당 booth_id 대기 건수 fetch
- 대기 없을 때는 '여유롭게 주문하세요' 문구만 표시

---

## 5. CheckoutPage — 결제 직전 부스별 대기 요약

결제 버튼 위에 담은 부스별 대기 현황 표시:

```
주문하신 매장의 현재 대기 현황
[매장명 A]  대기 2건 · 약 10분
[매장명 B]  대기 없음 · 바로 준비
```

- 장바구니 booth_id 기준으로 해당 부스만 조회
- 결제 직전 최신 데이터로 한 번 더 fetch

---

## 6. AdminFood 편집 모달 — 처리 시간 설정

기존 편집 모달에 항목 추가:

```
건당 평균 처리 시간: [5] 분
(예상 대기 시간 계산에 사용됩니다)
```

- `avg_prep_minutes` UPDATE
- 기본값 5분, 입력 범위 1~30분

---

## 7. Realtime 구독 전략

```typescript
// FoodSections 마운트 시 단일 채널 구독
const channel = supabase
  .channel('waiting-counts')
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'order_items',
  }, (payload) => {
    // booth_id 기준 로컬 상태만 업데이트 (전체 재fetch 없음)
    updateBoothWaitingCount(payload.new?.booth_id ?? payload.old?.booth_id);
  })
  .subscribe();

// 페이지 언마운트 시 반드시 해제
return () => supabase.removeChannel(channel);
```

---

## 8. UX 원칙

- 예상 시간은 항상 "실제 준비 시간은 다를 수 있습니다" 안내 문구 병기
- 대기 건수가 많아도 주문 제한 없음 — 선택은 방문객 자유
- `src/types/database.ts` 에 `avg_prep_minutes` 컬럼 타입 추가
- 빌드 검증은 반드시 `npm run build`
