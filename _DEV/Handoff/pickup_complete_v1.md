# 픽업완료 단계 추가 v1

> alcohol_consent_v1 검증 중 발견된 근본 흐름 문제 해결.
> 신분증 확인 시점이 잘못됐던 것을 픽업완료 단계 신설로 정렬.

---

## 1. 배경

현재 부스앱 흐름:
```
시간 버튼(확인+예상) → 조리 → 준비완료 → [종결]
```

문제:
- **신분증 확인 시점 모순** — 주류 결제 시 [준비완료] 클릭에 신분증 confirm 모달이 떴으나, 이 시점은 손님이 부스 도착 전. 신분증 확인 불가능한 시점에 확인 강제.
- **픽업 데이터 부재** — 손님이 안 가져간 음식 추적 불가
- **부스 단위 거절 시점 부족** — 매장이 손님 보고 거절(환불) 결정할 수 있는 시점은 픽업 시점인데, [준비완료] 누르면 거절 버튼 사라짐

해결:
```
시간 버튼(확인+예상) → 조리 → 준비완료(알림) → 픽업완료(수령) → [종결]
                                              ↑
                                  여기서 신분증 확인 / 거절 결정
```

---

## 2. 작업 원칙

- **모든 주문에 적용** — 주류만 분기 X. 시스템 일관성
- **기존 버튼 유지** — 시간 버튼 / 준비완료 버튼 그대로. 픽업완료 버튼만 추가
- **UI 변경 최소** — 카드 레이아웃 틀어지지 않게. 필요 시 버튼 사이즈 조정
- **거절 버튼 라이프사이클 연장** — 픽업완료 전까지 거절 버튼 유지

---

## 3. DB 변경

### `_DEV/Seeds/30_pickup_complete.sql`

```sql
BEGIN;

-- 픽업완료 시점
ALTER TABLE orders 
  ADD COLUMN IF NOT EXISTS picked_up_at TIMESTAMPTZ;

-- 픽업한 운영진/매장 (선택 — 사후 분쟁 추적)
-- ALTER TABLE orders ADD COLUMN IF NOT EXISTS picked_up_by UUID REFERENCES auth.users(id);
-- ※ 매장 계정은 별도 테이블이라 도입 보류. 필요 시 v2

COMMIT;
```

기존 데이터: `picked_up_at = NULL` 로 시작. 행사 진행 중에만 채워짐. 마이그레이션 영향 없음.

---

## 4. `src/types/database.ts` 변경

`orders` Row/Insert/Update:
```typescript
picked_up_at: string | null;
```

---

## 5. 부스앱 — 카드 상태 변경

### 5-1. 상태별 카드 표시

| status / 컬럼 상태 | 카드 위치 | 표시 버튼 |
|---|---|---|
| `paid` (미확인) | 좌측 대기 영역 | 시간 버튼 5개 + 거절 |
| `confirmed_at != null, ready_at = null` (조리 중) | 좌측 대기 영역 | **준비완료** + 거절 |
| `ready_at != null, picked_up_at = null` (픽업 대기) | **신규 영역** 또는 동일 영역 다른 색 | **픽업완료** + 거절 |
| `picked_up_at != null` (종결) | 우측 완료 영역 | (버튼 없음) |

### 5-2. 카드 레이아웃 가이드

- 기존 시간 버튼 5개 / 준비완료 버튼 / 거절 버튼은 그대로
- [픽업완료] 버튼은 [준비완료] 버튼 자리를 ready 상태에서 대체
- 즉 같은 카드 영역에서 status 따라 버튼 1개만 노출 (시간버튼 5개 → 준비완료 → 픽업완료)
- 거절 버튼은 ready 상태에서도 유지 (현재 confirmed 까지만 노출이라면 ready 까지 확장)
- 카드 사이즈 조정 자유 — 단, 데스크탑 가로 모드 기준 최소 높이 유지

### 5-3. 픽업완료 버튼 동작

**일반 메뉴:**
```typescript
// 즉시 처리
await markOrderPickedUp(orderId);
```

**주류 메뉴 포함 주문:**
```
┌────────────────────────────────────┐
│  ⚠ 신분증 확인 필수                 │
│                                    │
│  이 주문에는 주류가 포함되어 있습니다. │
│  손님 신분증을 확인하셨습니까?       │
│                                    │
│  ☐ 신분증 확인 완료 (만 19세 이상) │
│                                    │
│  [거절]            [픽업완료 처리] │
└────────────────────────────────────┘
```

체크 안 하면 [픽업완료 처리] disabled. [거절] 클릭 시 기존 거절 흐름.

### 5-4. ready 상태 시각 강조

ready 상태 카드는 `confirmed` 카드와 구별되도록 색상 또는 배지:
- 예: 카드 좌측 보더 청록색(또는 사용자 디자인 시스템 따라)
- 배지 `🔔 픽업 대기 중`
- 주류 포함 시 빨간 배지 `🍺 신분증 확인 필수` (alcohol_consent_v1 작업 그대로)

---

## 6. API 신규 / 변경

### 6-1. `POST /api/orders/[id]/pickup`

- 인증: 매장 계정
- 처리: `picked_up_at = NOW()` 업데이트
- 검증: `ready_at IS NOT NULL AND picked_up_at IS NULL` 만 통과
- 응답: 업데이트된 order

### 6-2. `markOrderReady` 분리

기존 `markOrderReady` 가 종결 처리까지 했다면, 이제는 `ready_at` 만 채우고 종결 X. 종결은 `pickup` API.

코드베이스에 따라 다를 수 있음 — 기존 ready 처리 로직에 `picked_up_at = NOW()` 같이 박혀있으면 분리 필요.

### 6-3. 거절 (`/api/orders/cancel`) 조건 변경

기존:
```typescript
isBoothOrderRefundable = ready_at IS NULL && status IN ('paid', 'confirmed') && balance > 0
```

변경:
```typescript
isBoothOrderRefundable = picked_up_at IS NULL && status IN ('paid', 'confirmed') && balance > 0
```

`ready_at IS NULL` 조건을 `picked_up_at IS NULL` 로 교체. ready 상태에서도 거절 가능해짐.

---

## 7. 손님 PWA (`OrderStatusPage`)

### 7-1. 상태별 표시

| 시스템 상태 | 손님 메시지 |
|---|---|
| paid | 매장 확인 대기 중 |
| confirmed | 매장 확인완료 · 약 N분 후 준비됩니다 (기존) |
| ready (`picked_up_at` 없음) | **🔔 준비완료 — 픽업해주세요** (기존 알림 배너) |
| picked_up | **✓ 수령 완료되었습니다 · 맛있게 드세요** (신규) |

### 7-2. 주류 안내

기존 alcohol_consent_v1 의 \"신분증 지참\" 안내는 ready 단계에서 더 강조:
- ready 상태에서 빨간 배너 \"신분증 지참 후 매장 방문\"

---

## 8. 통계 (선택 — 본 페이즈에 포함 가능)

`StatsRevenueTab` 또는 어드민 통계에 픽업률 추가:

```sql
SELECT 
  COUNT(*) AS total_ready,
  COUNT(picked_up_at) AS total_picked_up,
  COUNT(*) - COUNT(picked_up_at) AS unpicked,
  ROUND(COUNT(picked_up_at)::numeric / NULLIF(COUNT(*), 0) * 100, 1) AS pickup_rate_pct
FROM orders
WHERE ready_at IS NOT NULL
  AND status NOT IN ('cancelled');
```

본 v1 에 통계 포함 여부는 작업 부담 따라. 코드량 적으면 포함, 부담스러우면 제외.

---

## 9. 확정 사항 (질문 금지)

| Q | 결정 |
|---|---|
| 적용 범위 | 모든 주문 (주류만 분기 X) |
| 기존 버튼 | 시간 버튼 5개 / 준비완료 / 거절 그대로 유지 |
| 픽업완료 버튼 위치 | 준비완료 버튼 자리. status 따라 한 버튼만 노출 |
| 거절 버튼 라이프사이클 | picked_up_at IS NULL 까지 유지 |
| 주류 픽업완료 confirm | 모달 + 체크박스 강제 (alcohol_consent_v1 패턴 재사용) |
| 자동 픽업 처리 | 본 v1 X. 행사 후 데이터 보고 v2 검토 |
| 미픽업 알림 | 본 v1 X. v2 검토 |
| 환불 가능 조건 | `ready_at IS NULL` → `picked_up_at IS NULL` 변경 |
| picked_up_by 컬럼 | 본 v1 X. 매장 계정 분리 별도 작업 |
| 손님 메시지 \"수령 완료\" | ready 후 \"수령 완료되었습니다\" 표시 |

---

## 10. 검증 절차 — 작업 완료 후 사용자 실행

### 10-1. 부스앱 흐름

- [ ] paid 카드 → 시간 버튼 5개 + 거절 노출
- [ ] confirmed 카드 → 준비완료 + 거절 노출
- [ ] ready 카드 → **픽업완료 + 거절** 노출 (거절 사라지지 않음)
- [ ] picked_up 카드 → 우측 완료 영역 이동, 버튼 없음

### 10-2. 일반 메뉴 픽업

- [ ] 시간 버튼 → 준비완료 → 픽업완료 → 우측 이동 (확인 모달 없음)
- [ ] DB: `picked_up_at` 채워짐, `ready_at` 그대로

### 10-3. 주류 메뉴 픽업

- [ ] ready 카드 → [픽업완료] 클릭 → confirm 모달 등장
- [ ] 체크박스 미체크 → [픽업완료 처리] disabled
- [ ] 체크 후 [픽업완료 처리] → 정상 처리, 우측 이동
- [ ] [거절] → 기존 거절 흐름

### 10-4. ready 상태 거절 (신규 가능 케이스)

- [ ] 손님 미성년 발견 → ready 카드의 [거절] 버튼 클릭
- [ ] 환불 사유 입력 → 환불 처리
- [ ] DB: `status='cancelled'`, `picked_up_at IS NULL`

### 10-5. 손님 PWA

- [ ] confirmed 단계 → \"매장 확인완료\" 메시지
- [ ] ready 단계 → \"준비완료 — 픽업해주세요\" 배너 + (주류 시) 신분증 안내
- [ ] picked_up 단계 → \"수령 완료되었습니다\" 메시지

### 10-6. 어드민 환불

- [ ] ready 상태 주문 → 환불 가능 (기존엔 환불 불가)
- [ ] picked_up 상태 주문 → 환불 불가 (기존 ready 와 동일 동작)
- [ ] 일괄 환불 (세션 27) — picked_up_at IS NULL 만 대상

### 10-7. 통계 (포함 시)

```sql
-- 픽업률 검증
SELECT 
  COUNT(*) FILTER (WHERE ready_at IS NOT NULL) AS readied,
  COUNT(*) FILTER (WHERE picked_up_at IS NOT NULL) AS picked_up,
  COUNT(*) FILTER (WHERE ready_at IS NOT NULL AND picked_up_at IS NULL) AS unpicked
FROM orders WHERE status != 'cancelled';
```

---

## 11. 빌드 검증

`npx tsc --noEmit` 통과 확인.

---

## 12. 커밋

```
feat(order): add pickup_complete stage to order lifecycle

- Add picked_up_at column to orders
- Add pickup button to booth dashboard (after ready)
- Confirm modal for alcohol orders at pickup time
- Extend reject button availability until picked_up_at
- Update isBoothOrderRefundable to use picked_up_at IS NULL
- Customer status page shows "수령 완료" after pickup
```

dev push 까지.

---

## 13. 후속 작업 (별도 페이즈)

- 자동 픽업 처리 (ready 후 N분 경과 시) — 행사 데이터 본 후 결정
- 미픽업 주문 어드민 알림 — 출동 대상
- 매장 계정 분리 후 `picked_up_by` 추적
- 픽업률 통계 정식 섹션화
