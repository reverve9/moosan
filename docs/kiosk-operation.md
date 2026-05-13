# 헬프데스크 키오스크 운영 매뉴얼

> 설악무산문화축전 헬프데스크 부스용 셀프 주문 키오스크 (v1 fix)
> 2대 키오스크(스탠바이미 + 노트북) + 1대 직원 직접 입력 폴백 = 3개 어드민 계정 동시 운영

---

## 1. 운영 구조 (3계정)

| 계정 | 머신 | 역할 | 키오스크 URL `?station=` |
|---|---|---|---|
| `admin01` | 노트북 단독 | 직원 직접 메뉴 입력 (`/help-desk → 주문 입력`) | (해당 없음) |
| `admin02` | 노트북 + 터치모니터 | 키오스크 #1 | `helpdesk-1` |
| `admin03` | 노트북 + 터치모니터 | 키오스크 #2 | `helpdesk-2` |

모든 계정은 같은 결제 대기 큐(`/help-desk → 키오스크 대기`)를 본다 — 직원 누구나 결제 처리 가능.

## 2. 접속 URL

| 환경 | 키오스크 #1 | 키오스크 #2 | 어드민 결제 대기 큐 |
|---|---|---|---|
| dev  | `https://admin-musanfesta-dev.vercel.app/kiosk?station=helpdesk-1` | `https://admin-musanfesta-dev.vercel.app/kiosk?station=helpdesk-2` | `/help-desk` → **키오스크 대기** 탭 |
| prod | `https://admin.musanfesta.com/kiosk?station=helpdesk-1` | `https://admin.musanfesta.com/kiosk?station=helpdesk-2` | `https://admin.musanfesta.com/help-desk` |
| local | `http://admin.localhost:5173/kiosk?station=helpdesk-1` | `http://admin.localhost:5173/kiosk?station=helpdesk-2` | `http://admin.localhost:5173/help-desk` |

> `?station=` 누락 시 기본값 `helpdesk-1`. 본 매뉴얼대로 항상 명시 권장 (헤더 우측 상단의 `#1`/`#2` 배지로 확인).

> 키오스크 라우트(`/kiosk`)는 **admin 호스트 안의 standalone 라우트** (AdminLayout 외부) 라
> 사이드바·헤더 없이 풀스크린으로 노출된다. 손님 PWA 도메인에는 노출 X.

---

## 2. 매장 운영 절차

### 2-1. 개점

1. 어드민 노트북에서 `https://admin.musanfesta.com` 에 로그인.
2. HDMI / Type-C 케이블로 스탠바이미를 확장 디스플레이로 연결.
3. 두 번째 Chrome 창을 새로 열고 스탠바이미 화면으로 드래그.
4. `F11` 으로 풀스크린 진입 후 `https://admin.musanfesta.com/kiosk` 접속.
5. (선택) Chrome 키오스크 모드로 재시작 — 키 입력으로 빠져나갈 수 없음:

   ```bash
   # 키오스크 #1 (admin02 노트북)
   /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
     --kiosk --app="https://admin.musanfesta.com/kiosk?station=helpdesk-1"

   # 키오스크 #2 (admin03 노트북)
   /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
     --kiosk --app="https://admin.musanfesta.com/kiosk?station=helpdesk-2"
   ```

   윈도우/리눅스:
   ```
   chrome --kiosk --app="https://admin.musanfesta.com/kiosk?station=helpdesk-1"
   chrome --kiosk --app="https://admin.musanfesta.com/kiosk?station=helpdesk-2"
   ```

   ⚠ 키오스크가 다른 station 으로 떴는지 확인: 헤더 우측 상단의 `#1` / `#2` 배지로 즉시 식별 가능.

### 2-2. 직원 어드민 화면

- `결제 도우미 → 키오스크 대기` 탭을 띄워두고 손님 결제 요청이 오는지 모니터링.
- 손님이 "결제 요청" 누르면 카드 형태로 즉시 표시됨 (realtime).
- 카드 클릭 → 결제 처리 모달 → 카드 또는 현금 선택 → "결제 완료" → 키오스크가
  자동으로 "결제 완료" 화면으로 전환되고 5초 후 처음 화면으로 돌아감.

### 2-3. 예외 상황

| 상황 | 직원 조치 |
|---|---|
| 손님이 자리를 떠남 | 3분 후 자동 리셋. 즉시 리셋하려면 어드민에서 "**키오스크 #1 초기화**" 또는 "**#2 초기화**" 버튼 |
| 카드 결제 시도 후 실패 | 모달에서 취소 후 다시 시도. 결제수단을 현금으로 변경 가능 |
| 화면이 멈춤 | Chrome 새로고침 (`Cmd+R` / `F5`). 장바구니는 초기화됨 |
| 인터넷 끊김 | Supabase realtime 재연결 자동. 5분 이상 지속되면 새로고침 |

---

## 3. 운영 흐름

```
[손님 — 키오스크]                              [직원 — 어드민]
   menu (메뉴 선택)
       ↓
   phone (전번 입력)
       ↓ 결제 요청
   ┌────────────────────────────┐
   │ orders insert              │
   │ status=payment_pending      │
   │ payment_channel=helpdesk    │
   └────────────────────────────┘
       ↓ realtime broadcast      ───→  [결제 도우미 → 키오스크 대기 탭]
   waiting (대기 화면)                       카드 클릭
       ↑                                       ↓
       │                                  카드/현금 선택
       │                                       ↓
       │                                  결제 완료 처리
       │ ←── payments.status='paid' ────  (confirmKioskPayment)
   done (5초 카운트다운)
       ↓
   menu (자동 리셋)
```

---

## 4. 디자인 / 인터랙션 원칙

- 풀스크린 1920×1080 가로 기준. 더 작은 화면은 권장하지 않음.
- 버튼 최소 높이 60px (실측은 더 큼 — 결제 버튼 84px). 노년층 사용 고려.
- 손님이 `waiting` 단계에서 **빠져나갈 경로 없음** — "처음으로" 버튼이 숨겨짐.
  새로고침 또는 직원 강제 리셋 / 결제 완료 자동 전환만 허용.

---

## 5. 트러블슈팅

### 결제 대기 큐에 손님 요청이 안 보임
- 어드민 realtime 연결 확인. 사이드바 우상단에 realtime 상태 아이콘이 있다면 그 색.
- "새로고침" 버튼으로 강제 갱신.
- DB 직접 확인:
  ```sql
  SELECT id, payment_id, booth_name, status, payment_channel, created_at
  FROM orders
  WHERE status='payment_pending' AND payment_channel='helpdesk'
  ORDER BY created_at DESC LIMIT 20;
  ```

### 키오스크 "결제 완료" 화면으로 안 넘어감
- 직원이 결제 완료 처리 후 키오스크가 5초 이내에 안 전환되면 새로고침.
- realtime 미스인 경우 키오스크가 1차로 status 한 번 fetch 하지만, 그것도 실패하면 새로고침 필요.

### 키오스크 "결제 대기" 화면에서 손님이 가버림
- 어드민 결제 대기 큐 카드를 우클릭 (또는 길게 누름) — 없으면 즉시 결제 완료 처리 또는
  Supabase SQL Editor 에서 직접 cancel:
  ```sql
  UPDATE orders SET status='cancelled', cancelled_at=now(), cancel_reason='no-show'
  WHERE payment_id='<paymentId>' AND status='payment_pending';
  UPDATE payments SET status='cancelled', cancelled_at=now()
  WHERE id='<paymentId>';
  ```
  (v1 에는 직접 취소 UI 미구현 — 필요해지면 별도 추가)

---

## 6. 통계

`어드민 → 매출관리 → 매출` 탭의 "**채널별 매출 (앱 / 헬프데스크)**" 섹션에서:

- 앱 결제 매출 / 헬프데스크 매출 비교
- 헬프데스크 내 카드 / 현금 분리
- 합계

매장별 매출은 채널 합산이라 정산 영향 없음 (정책: 매장 정산은 method 무관 일률 적용).
