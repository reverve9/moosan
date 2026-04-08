# 음식문화페스티벌 주문/결제 시스템 — 추가 요구사항

> 기존 프롬프트(`food_payment_system_prompt.md`) 에 추가되는 내용만 정리

---

## 1. DB 스키마 추가

### `order_items` 컬럼 추가
```sql
ALTER TABLE order_items
  ADD COLUMN confirmed_at TIMESTAMPTZ,        -- 매장 확인 시각
  ADD COLUMN is_ready BOOLEAN DEFAULT false;  -- 준비 완료 여부 (기존)
```

### `food_menus` 컬럼 추가
```sql
ALTER TABLE food_menus
  ADD COLUMN is_sold_out BOOLEAN DEFAULT false;
```

---

## 2. 매장 앱 — Android 최적화

### Wake Lock API 적용
- 부스 대시보드(`/booth/dashboard`) 진입 시 `navigator.wakeLock.request('screen')` 호출
- 화면 꺼짐 방지 (Android 지원, iOS는 미지원이므로 무시)
- 페이지 이탈 시 Wake Lock 해제

### 주문 수신 알림
- 새 주문 Realtime 수신 시:
  - 소리 알림 (Web Audio API 또는 `<audio>` 태그 — 짧은 알림음)
  - 진동 (`navigator.vibrate([200, 100, 200])`)
  - 새 주문 카드 상단 고정 + pulse 애니메이션

### 수동 새로고침
- 헤더에 새로고침 버튼 항상 노출
- 연결 끊김 감지 시 "연결 끊김" 배너 표시 + 자동 재연결 시도

---

## 3. 주문 확인 플로우 (배민 스타일)

### 흐름
```
결제 완료 → order_items INSERT (confirmed_at = null)
→ 매장 앱 Realtime 수신 → 소리 + 진동
→ 직원 "확인" 버튼 클릭 → confirmed_at = now() UPDATE
→ 어드민 모니터 + 고객 주문 조회에 "확인됨" 반영

1분 경과 후에도 confirmed_at = null 이면
→ 어드민 모니터링 화면 해당 부스 카드 빨간색 강조 + 소리 알림
→ 운영요원이 해당 부스 직접 고지
```

### 매장 앱 주문 카드 상태
- `confirmed_at = null` → "확인" 버튼 활성 (주황색 강조)
- `confirmed_at != null, is_ready = false` → "준비중" 표시
- `is_ready = true` → "완료" 표시 (완료 탭으로 이동)

---

## 4. 어드민 실시간 모니터링 페이지 (`/admin/monitor`)

운영요원 2명이 노트북에서 상시 모니터링하는 전용 화면.

### 레이아웃
- 1280px 어드민 레이아웃 사용
- 25개 부스 카드 그리드 (4~5열)

### 부스 카드 구성
- 부스명 + 부스번호
- 미확인 주문 수 배지
- 가장 오래된 미확인 주문 경과 시간 카운트업 (초 단위)
- 상태별 색상:
  - 미확인 없음 → 기본
  - 미확인 있음 (1분 미만) → 주황색
  - 1분 초과 미확인 → 빨간색 + pulse
- 카드 클릭 → 해당 부스 미확인 주문 목록 드릴다운 (모달)

### 알림
- 1분 초과 부스 발생 시 소리 알림 (노트북 스피커)
- 브라우저 탭 타이틀에 미확인 건수 표시 (`(3) 실시간 모니터 — 어드민`)

### Realtime
- `order_items` 구독 (confirmed_at, is_ready 변경 감지)
- 전체 부스 대상 (부스 필터 없음)

### 어드민 사이드바
- "실시간 모니터" 메뉴 추가 (SignalIcon 또는 EyeIcon)
- 미확인 주문 있을 때 사이드바 배지 표시

---

## 5. 고객 주문 조회 페이지 상태 추가

기존 `pending / paid / completed` 에 `confirmed` 상태 추가:

| 상태 | 표시 문구 |
|------|-----------|
| paid | 결제완료 · 매장 확인 대기중 |
| confirmed | 매장 확인완료 · 준비중 |
| completed | 준비완료 · 픽업해주세요 |

- `confirmed` 판단: 해당 주문의 모든 `order_items.confirmed_at != null`
- `completed` 판단: 해당 주문의 모든 `order_items.is_ready = true`
- Realtime 구독으로 자동 업데이트

---

## 6. 빌드/배포 주의사항 (기존 동일)

- 신규 컬럼 추가 후 `src/types/database.ts` 반드시 업데이트
- 검증은 `npm run build` (`tsc --noEmit` 아님)
