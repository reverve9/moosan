# 테스트 이슈 수정 — 세션 20

---

## 1. 쿠폰 중복 방지 — localStorage 기반

### 배경
전화번호 기반 중복 방지만으로는 다른 번호 입력 시 우회 가능.
설문이 길고 할인액이 2,000원(만원 이상 + 1회 사용)이라 어뷰징 ROI 낮음.
localStorage로 디바이스 기반 중복 방지 추가. 엣지케이스 통과는 허용.

### 구현

`src/lib/survey.ts` 에 추가:

```typescript
const SURVEY_DONE_KEY = 'survey_done';

export function hasSurveyDoneLocally(): boolean {
  return localStorage.getItem(SURVEY_DONE_KEY) === 'true';
}

export function markSurveyDoneLocally(): void {
  localStorage.setItem(SURVEY_DONE_KEY, 'true');
}
```

`SurveyForm.tsx`:
- 설문 폼 진입 시 `hasSurveyDoneLocally()` 체크
- true면 "이미 설문에 참여하셨습니다" 안내 + `/program/food` 이동 버튼
- 설문 제출 성공 후 `markSurveyDoneLocally()` 호출

---

## 2. 부스 알람 단순화

### 변경 사항
- 새 주문 즉시 알람 → **제거**
- 1분/2분 구분 → **제거**
- `order_alert.mp3` → **미사용** (파일 삭제 불필요, 코드에서만 제거)
- `order_alarm.mp3` → **단일 사용**

### 새 로직

```
미확인 주문 (confirmed_at = null) 이 1개 이상 존재
→ 1분 간격으로 order_alarm.mp3 재생 (3회)
→ 미확인 주문 없으면 알람 없음
```

`src/pages/booth/BoothDashboardPage.tsx`:

```typescript
// 기존 새 주문 즉시 알람 (onOrderPaid 의 playSound) 제거
// 기존 1분/2분 초과 전이 감지 useEffect 제거

// 신규 — 1분 간격 반복 알람
useEffect(() => {
  const interval = setInterval(() => {
    const hasUnconfirmed = waitingOrders.some(
      o => !o.confirmed_at && !o.cancelled_at
    );
    if (hasUnconfirmed) {
      playSound('alarm', 3);
    }
  }, 60000); // 1분 간격

  return () => clearInterval(interval);
}, [waitingOrders]);
```

- `alertedIdsRef` 제거 (주문별 추적 불필요)
- 진동은 유지 (`vibrateSafe`) — 알람 재생 시 같이

### `src/lib/audioCue.ts`
- `playSound` 의 `'alert'` 타입 제거 또는 `'alarm'` 으로 통일
- `order_alert.mp3` 참조 제거

---

## 3. OrderStatusPage — 조리완료 상단 스트립

### UI

```
┌──────────────────────────────────────────┐
│ 🍽 [매장명] 준비완료 · 픽업해주세요    [✓] │
└──────────────────────────────────────────┘
┌──────────────────────────────────────────┐
│ 🍽 [매장명B] 준비완료 · 픽업해주세요   [✓] │
└──────────────────────────────────────────┘

[주문 내용 기존 UI]
```

- 준비완료 부스가 생기면 페이지 최상단에 스트립 노출
- 여러 부스면 스트립 여러 줄
- [✓] 클릭 → 해당 스트립만 사라짐 (DB 저장 없음, 클라이언트 상태만)
- Realtime으로 `order_items.is_ready = true` 변경 감지 → 자동 추가

### 구현

`src/pages/OrderStatusPage.tsx`:

```typescript
// 클라이언트 상태
const [dismissedBooths, setDismissedBooths] = useState<Set<string>>(new Set());

// 준비완료 부스 목록 (중복 제거)
const readyBooths = useMemo(() => {
  return orderItems
    .filter(item => item.is_ready && !dismissedBooths.has(item.booth_id))
    .reduce((acc, item) => {
      if (!acc.find(b => b.booth_id === item.booth_id)) {
        acc.push({ booth_id: item.booth_id, booth_name: item.booth_name });
      }
      return acc;
    }, [] as { booth_id: string; booth_name: string }[]);
}, [orderItems, dismissedBooths]);

// 스트립 렌더
{readyBooths.map(booth => (
  <div key={booth.booth_id} className={styles.readyStrip}>
    <span>🍽 {booth.booth_name} 준비완료 · 픽업해주세요</span>
    <button onClick={() => setDismissedBooths(prev => new Set([...prev, booth.booth_id]))}>
      ✓
    </button>
  </div>
))}
```

### CSS (`OrderStatusPage.module.css`)

```css
.readyStrip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px var(--space-5);
  background: var(--color-primary);
  color: #ffffff;
  font-size: var(--text-cq-body);
  font-weight: 600;
  gap: var(--space-3);
}

.readyStrip button {
  flex-shrink: 0;
  background: rgba(255,255,255,0.2);
  border: none;
  color: #ffffff;
  border-radius: 50%;
  width: 28px;
  height: 28px;
  cursor: pointer;
  font-size: 14px;
}
```

- 스트립은 페이지 최상단 (Header 바로 아래)
- 준비완료 부스 없으면 미렌더

---

## 주의사항

- `order_alert.mp3` 파일 삭제 불필요 — 코드 참조만 제거
- `alertedIdsRef` 관련 코드 전부 제거
- 빌드 검증은 `npm run build`
