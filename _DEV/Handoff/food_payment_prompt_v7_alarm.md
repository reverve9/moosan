# 알람 묶음 — 매장용 + 어드민 모니터

> 세션 19 0순위 작업
> 기존 프롬프트 v1~v6 에 추가되는 내용

---

## 확정 사항

**사용자 알람**: Realtime OrderStatusPage 상태 변경 감지로 충분 (기존 구현 유지) — SMS/푸시 불필요

**매장용 알람**: 소리 + 진동 + 화면 강조

**Wake Lock**: 탭 자체 설정으로 화면 꺼짐 방지하지만 보험으로 코드 삽입

---

## 1. 사운드 파일

```
public/sounds/order_alarm.mp3   — 새 주문 수신 시
public/sounds/order_alert.mp3   — 1분/2분 초과 시 (더 강한 톤)
```

파일은 직접 배치. 코드는 이 경로 참조.

---

## 2. `src/hooks/useWakeLock.ts` 신규

```typescript
export function useWakeLock() {
  useEffect(() => {
    let wakeLock: WakeLockSentinel | null = null;

    const acquire = async () => {
      if ('wakeLock' in navigator) {
        try {
          wakeLock = await navigator.wakeLock.request('screen');
        } catch {}
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') acquire();
    };

    acquire();
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      wakeLock?.release();
    };
  }, []);
}
```

- 미지원 브라우저 no-op
- 탭 복귀 시 자동 재요청 (visibilitychange)

---

## 3. `src/lib/audioCue.ts` 신규

```typescript
// 소리 재생 + 반복
export async function playSound(
  type: 'alarm' | 'alert',
  repeat: number = 3
) {
  const src = type === 'alarm'
    ? '/sounds/order_alarm.mp3'
    : '/sounds/order_alert.mp3';

  for (let i = 0; i < repeat; i++) {
    const audio = new Audio(src);
    await new Promise<void>(resolve => {
      audio.onended = () => resolve();
      audio.onerror = () => resolve(); // 실패 시 조용히 무시
      audio.play().catch(() => resolve());
    });
  }
}
```

- 새 주문: `playSound('alarm', 3)`
- 1분/2분 초과: `playSound('alert', 3)`
- 브라우저 autoplay 정책 주의 — 최초 사용자 제스처 이후 동작 보장
- BoothDashboardPage 진입 시 무음 재생으로 AudioContext unlock (더미 버튼 또는 로그인 버튼 클릭 시점 활용)

---

## 4. BoothDashboardPage 알람 연동

### 새 주문 수신 시
```typescript
// Realtime onInsert 콜백
const handleNewOrder = (newItem: OrderItem) => {
  // 초기 snapshot 제외 (마운트 시 기존 주문 무시)
  if (isInitialLoad) return;

  playSound('alarm', 3);
  navigator.vibrate?.([300, 100, 300, 100, 300]);
};
```

- 초기 로드 플래그로 기존 주문 알람 방지
- `navigator.vibrate` 없으면 무시

### 1분 초과 알람
```typescript
useEffect(() => {
  const interval = setInterval(() => {
    const now = Date.now();
    waitingOrders.forEach(order => {
      const elapsed = now - new Date(order.created_at).getTime();
      const prevElapsed = prev[order.id] ?? 0;

      // 1분 초과 전이 시 (이전엔 미만, 지금은 이상)
      if (elapsed >= 60000 && prevElapsed < 60000) {
        playSound('alert', 3);
      }
      // 2분 초과 전이 시
      if (elapsed >= 120000 && prevElapsed < 120000) {
        playSound('alert', 3);
      }
    });
    setPrev(snapshot);
  }, 5000); // 5초마다 체크

  return () => clearInterval(interval);
}, [waitingOrders]);
```

- 1분/2분 각각 1회씩만 울림 (전이 감지)
- 5초 간격 체크 (1초는 과도)

### Wake Lock 적용
```typescript
// BoothDashboardPage 상단
useWakeLock();
```

---

## 5. 어드민 모니터 — 2분 초과 강조 추가

### 기존
- 1분 미만: 기본
- 1분 초과: 주황색 경고

### 변경 후
- 1분 미만: 기본
- 1분 초과: 주황색 경고 (기존 유지)
- 2분 초과: 빨간색 + pulse 애니메이션 + 소리 알람

```typescript
// AdminMonitor — 2분 초과 전이 감지
if (alertCount2min > prev2min) {
  playSound('alert', 3);
}
```

```css
/* AdminMonitor.module.css */
.cardAlert2min {
  border-color: var(--color-error);
  background: #FEF2F2;
  animation: pulse 1s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}
```

### document.title 카운터
```typescript
// AdminLayout
useEffect(() => {
  if (alertCount > 0) {
    document.title = `(${alertCount}) 실시간 모니터 · 설악무산문화축전`;
  } else {
    document.title = '설악무산문화축전 어드민';
  }
  return () => { document.title = '설악무산문화축전 어드민'; };
}, [alertCount]);
```

---

## 6. 파일 변경 요약

### 신규
- `public/sounds/order_alarm.mp3` (직접 배치)
- `public/sounds/order_alert.mp3` (직접 배치)
- `src/hooks/useWakeLock.ts`
- `src/lib/audioCue.ts`

### 수정
- `src/pages/booth/BoothDashboardPage.tsx` — useWakeLock + onOrderPaid alarm + 1분/2분 alert
- `src/pages/admin/AdminMonitor.tsx` — 2분 초과 강조 + 소리 + alertCount
- `src/pages/admin/AdminMonitor.module.css` — `.cardAlert2min` + pulse
- `src/components/admin/AdminLayout.tsx` — document.title 동적 변경

---

## 7. 주의사항

- 브라우저 autoplay 정책: 사용자 제스처 없이 소리 재생 불가. 로그인 버튼 클릭 시점에 AudioContext unlock 처리
- `audioCue.ts` 는 순차 재생 (`await`) — 겹치지 않음
- 빌드 검증은 `npm run build`
