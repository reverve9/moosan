# 음식문화페스티벌 — 매장용 태블릿 대시보드

> 기존 프롬프트 v1~v4 에 추가되는 내용
> 갤럭시탭 전용, 가로 모드 고정, 기존 앱 `/booth/*` 경로 내 구현

---

## 1. 라우트 구조

```
/booth/login       — 매장 로그인 (기존)
/booth/dashboard   — 태블릿 대시보드 (신규 전면 재작성)
```

- 기존 모바일 기준 대시보드를 태블릿 전용으로 완전 재작성
- 로그인 로직 / 세션 관리 / Supabase 연동은 기존 그대로 유지

---

## 2. 가로 모드 고정

```typescript
// /booth/dashboard 진입 시
useEffect(() => {
  screen.orientation?.lock('landscape').catch(() => {});
  return () => screen.orientation?.unlock();
}, []);
```

- 갤럭시탭 Android 환경에서 동작
- 언마운트 시 orientation unlock

---

## 3. 레이아웃 구조

### 전체 구조
```
height: 100vh, width: 100vw
display: grid
grid-template-rows: 56px 1fr  (헤더 + 콘텐츠)
```

### 헤더 (56px, 고정)
```
┌──────────────────────────────────────────────────────┐
│ [매장명]  ● 연결됨        [품절 관리]  [로그아웃]    │
└──────────────────────────────────────────────────────┘
```

- 좌측: 매장명 (bold, 18px)
- 중앙: 연결 상태 dot (초록 = 연결, 빨강 = 끊김)
- 우측: 품절 관리 버튼 + 로그아웃 버튼
- 배경: 어드민 계열 다크 또는 primary 컬러 (기존 어드민 스타일 참고)

### 콘텐츠 영역
```
display: grid
grid-template-columns: 1fr 360px  (대기주문 메인 + 우측 패널)
```

---

## 4. 좌측 — 대기 주문 목록

- 제목: "대기 주문 (N건)"
- 스크롤 가능한 주문 카드 리스트
- Supabase Realtime 구독으로 신규 주문 자동 표시
- 신규 주문 수신 시: 소리 알림 + 진동 + 카드 상단 고정 + pulse 애니메이션

### 주문 카드
```
┌─────────────────────────────────────────┐
│  #F-240515-0023          · 2분 30초 전  │
│                                         │
│  김치찌개 × 1                           │
│  된장찌개 × 2                           │
│                                         │
│         [확인]        [준비완료]         │
└─────────────────────────────────────────┘
```

- 경과 시간 초 단위 카운트업 (실시간)
- 1분 미만: 기본 스타일
- 1분 초과: 카드 border 빨간색 + 경과 시간 빨간색 강조
- [확인] 버튼: `confirmed_at = now()` UPDATE
- [준비완료] 버튼: `is_ready = true` UPDATE → 완료 목록으로 이동
- 확인 전에도 준비완료 가능 (두 필드 동시 업데이트)

---

## 5. 우측 패널 (360px 고정)

### 상단 — 완료된 주문
- 제목: "완료 (N건)"
- 당일 완료 주문 카드 (스크롤)
- 완료 카드는 간소화: 주문번호 + 메뉴 요약 + 완료 시각
- 최대 최근 20건만 표시

### 하단 — 오늘 매출 (고정 높이 120px)
```
┌─────────────────────────┐
│  오늘 매출              │
│  32건   485,000원       │
└─────────────────────────┘
```
- `order_items` 집계: 해당 booth_id + 당일 + is_ready = true
- Realtime 업데이트

---

## 6. 품절 관리 모달

헤더 [품절 관리] 버튼 클릭 시 오픈

```
┌─────────────────────────────┐
│  메뉴 관리       [X]        │
│                             │
│  김치찌개   [판매중  ●]     │
│  된장찌개   [품절   ○]      │
│                             │
│           [닫기]            │
└─────────────────────────────┘
```

- 해당 부스 메뉴 2개 표시 (food_menus fetch)
- 토글 클릭 시 `food_menus.is_sold_out` UPDATE
- 변경 즉시 방문객 앱 반영 (Realtime)
- ESC / X / 닫기 버튼으로 닫기

---

## 7. CSS 구조

`src/pages/booth/BoothDashboard.module.css` 전면 재작성

```css
/* 태블릿 전용 — 뷰포트 100% 사용 */
.container {
  width: 100vw;
  height: 100vh;
  display: grid;
  grid-template-rows: 56px 1fr;
  overflow: hidden; /* 전체 스크롤 없음, 각 패널 내부 스크롤 */
}

.content {
  display: grid;
  grid-template-columns: 1fr 360px;
  overflow: hidden;
}

.waitingPanel {
  overflow-y: auto;
  padding: 16px;
}

.rightPanel {
  display: grid;
  grid-template-rows: 1fr 120px;
  border-left: 1px solid var(--color-border-light);
  overflow: hidden;
}

.completedPanel {
  overflow-y: auto;
  padding: 16px;
}

.salesPanel {
  padding: 16px;
  border-top: 1px solid var(--color-border-light);
  background: var(--color-bg-secondary);
}
```

- 기존 `--text-cq-*` 토큰 사용 안 함 (container query 아님)
- 고정 px 폰트 사용 (태블릿 고정 환경)
- `--color-*`, `--space-*` 토큰은 그대로 사용

---

## 8. Realtime 구독

```typescript
useEffect(() => {
  const channel = supabase
    .channel(`booth-${boothId}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'order_items',
      filter: `booth_id=eq.${boothId}`
    }, handleOrderChange)
    .subscribe();

  return () => supabase.removeChannel(channel);
}, [boothId]);
```

- 해당 부스 주문만 구독 (다른 부스 노이즈 없음)
- INSERT → 대기 목록 상단 추가 + 알림
- UPDATE → 해당 카드 상태 업데이트

---

## 9. 파일 구조

```
src/pages/booth/
├── BoothLoginPage.tsx          (기존 유지)
├── BoothLoginPage.module.css   (기존 유지)
├── BoothDashboardPage.tsx      (전면 재작성)
└── BoothDashboardPage.module.css (전면 재작성)
```

---

## 10. 주의사항

- `max-width: 600px` PWA 제약 적용하지 말 것 — 부스 대시보드는 `width: 100vw` 전체 사용
- `Layout.tsx` / `BottomNav` / `Header` 사용하지 않음 — 독립 레이아웃
- 빌드 검증은 `npm run build`
- 태블릿 화면 최소 해상도 기준: 1280×800 (갤럭시탭 A8 기준)
