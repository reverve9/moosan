# 음식문화페스티벌 주문/결제 시스템 개발 프롬프트

## 컨텍스트

설악무산문화축전 PWA (React + Vite + TypeScript + Supabase + Vercel) 에 음식문화페스티벌 주문/결제 시스템을 추가한다.

**현재 스택**
- Frontend: React + Vite + TypeScript, CSS Modules, `max-width: 600px` 모바일 PWA
- Backend: Supabase (DB + Storage + Realtime)
- 배포: Vercel (GitHub 연동 자동 배포)
- 어드민: 1280px 와이드 레이아웃 (`/admin/*`)
- 기존 핸드오프 문서 (`2026-04-08_세션6_핸드오프.md`) 기준 현재 상태 숙지 필수

**기존 관련 테이블**
- `food_booths` — 매장 (category, booth_no, thumbnail_url 등)
- `food_menus` — 메뉴 (booth_id FK, name, price, is_signature, image_url)
- `festivals` — 페스티벌 메타

---

## 요구사항 개요

### 사용자 흐름
1. FoodSections 부스 카드 → 메뉴 모달 → 장바구니 담기
2. 장바구니 (여러 부스 메뉴 혼합 가능) → 전화번호 입력 → 토스페이먼츠 결제
3. 결제 완료 → 주문번호 발급 → 주문 상태 조회 페이지 (`/order/:id`)
4. 부스에서 준비 완료 처리 → 앱 내 상태 업데이트

### 매장 직원 흐름
1. `/booth/login` → 부스 계정 로그인 (어드민에서 미리 생성한 계정)
2. `/booth/dashboard` → 실시간 주문 목록 + 완료 처리 + 품절 토글 + 당일 매출

### 어드민
- 부스 계정 관리 (생성/삭제)
- 부스별/일별/시간대별 매출 통계 + 시각화
- 엑셀 익스포트 (행사 결과 보고서용)

---

## 신규 DB 테이블 (Supabase SQL)

```sql
-- 주문 헤더
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT UNIQUE NOT NULL, -- 사람이 읽을 수 있는 번호 (예: F-240515-0001)
  phone TEXT NOT NULL,
  total_amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'completed', 'cancelled')),
  payment_key TEXT, -- 토스페이먼츠 paymentKey
  paid_at TIMESTAMPTZ,
  festival_id UUID REFERENCES festivals(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 주문 아이템 (부스별 정산 기준)
CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  booth_id UUID REFERENCES food_booths(id),
  menu_id UUID REFERENCES food_menus(id),
  menu_name TEXT NOT NULL, -- 스냅샷 (메뉴 삭제돼도 보존)
  menu_price INTEGER NOT NULL, -- 스냅샷
  booth_name TEXT NOT NULL, -- 스냅샷
  quantity INTEGER NOT NULL DEFAULT 1,
  subtotal INTEGER NOT NULL,
  is_ready BOOLEAN DEFAULT false, -- 해당 부스 준비 완료 여부
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 부스 직원 계정
CREATE TABLE booth_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booth_id UUID REFERENCES food_booths(id) ON DELETE CASCADE,
  login_id TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL, -- bcrypt
  created_at TIMESTAMPTZ DEFAULT now()
);
```

- RLS: orders/order_items public select (주문번호로 조회), insert anon 허용, update는 booth_accounts 인증 후
- `order_number` 생성 규칙: `F-{YYMMDD}-{4자리 순번}` (예: F-240515-0001)
- `updated_at` 트리거 적용
- `(festival_id, created_at)` 인덱스 추가

---

## Phase 1 — 주문/결제 코어

### 1-1. 장바구니 상태 관리

`src/store/cartStore.ts` (Zustand 또는 Context + useReducer)

```typescript
interface CartItem {
  menuId: string;
  boothId: string;
  boothName: string;
  menuName: string;
  price: number;
  quantity: number;
  imageUrl?: string;
}

interface CartStore {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  removeItem: (menuId: string) => void;
  updateQuantity: (menuId: string, quantity: number) => void;
  clear: () => void;
  totalAmount: number;
  totalCount: number;
}
```

- 부스 횡단 담기 허용 (booth_id 다른 아이템 혼재 가능)
- localStorage 퍼시스트 (페이지 이탈 후 복귀 시 유지)

### 1-2. FoodSections 메뉴 모달 수정

기존 모달에 "담기" 버튼 추가:
- 수량 선택 (stepper: `-` 숫자 `+`)
- "장바구니에 담기" 버튼 → 담기 완료 시 토스트 피드백
- 이미 담긴 메뉴면 수량 표시

### 1-3. 장바구니 페이지 (`/cart`)

`src/pages/CartPage.tsx`

- 담긴 아이템 목록 (부스별 그룹핑)
- 각 아이템: 썸네일 + 메뉴명 + 단가 × 수량 + 삭제
- 수량 변경 인라인
- 총 금액 + "주문하기" 버튼
- 빈 장바구니 상태 처리

BottomNav에 장바구니 아이콘 + 아이템 수 배지 추가 (위치: 음식 탭 옆 또는 우측 상단 floating)

### 1-4. 주문 페이지 (`/checkout`)

`src/pages/CheckoutPage.tsx`

- 주문 요약 (아이템 목록, 총 금액)
- 전화번호 입력 (숫자만, 010-XXXX-XXXX 포맷)
- "결제하기" 버튼 → 토스페이먼츠 호출

### 1-5. 토스페이먼츠 연동

```
npm install @tosspayments/payment-sdk
```

**결제 흐름:**
1. `CheckoutPage`에서 주문 레코드 `status: 'pending'` INSERT → `orderId` 확보
2. `tossPayments.requestPayment()` 호출
3. 성공 콜백: `/checkout/success?paymentKey=...&orderId=...&amount=...`
4. 실패 콜백: `/checkout/fail`

**`/checkout/success` 처리 (`src/pages/CheckoutSuccessPage.tsx`):**
1. 토스 서버사이드 승인 (Supabase Edge Function 또는 클라이언트 직접 호출 — 테스트 환경 먼저)
2. `orders.status` → `paid`, `payment_key` 저장
3. `/order/:orderId` 로 리다이렉트

### 1-6. 주문 상태 조회 페이지 (`/order/:id`)

`src/pages/OrderStatusPage.tsx`

- 주문번호 + 상태 표시 (결제완료 / 준비중 / 준비완료)
- 부스별 아이템 그룹핑 + 각 부스 준비 상태
- Supabase Realtime subscribe → `order_items.is_ready` 변경 시 자동 업데이트
- 전체 아이템 준비 완료 시 픽업 안내 메시지
- 전화번호로 당일 주문 목록 조회 기능 (`/order?phone=010XXXXXXXX`)

---

## Phase 2 — 매장 페이지

### 2-1. 부스 로그인 (`/booth/login`)

`src/pages/booth/BoothLoginPage.tsx`

- ID / PW 입력 폼
- `booth_accounts` 테이블 조회 + bcrypt 검증
- 성공 시 sessionStorage에 `{ boothId, boothName, loginId }` 저장
- `/booth/dashboard` 리다이렉트

### 2-2. 부스 대시보드 (`/booth/dashboard`)

`src/pages/booth/BoothDashboardPage.tsx`

**레이아웃:** 모바일 최적화 (`max-width: 600px`)

**탭 2개:**

① **주문 현황**
- 실시간 주문 목록 (Supabase Realtime)
- 카드 단위: 주문번호 + 주문시각 + 해당 부스 아이템 목록 + 완료 버튼
- 필터: 대기중 / 완료
- 완료 처리: `order_items.is_ready = true` UPDATE
- 새 주문 인입 시 시각적 강조 (pulse 애니메이션)

② **오늘 현황**
- 당일 총 매출
- 당일 주문 건수
- 메뉴별 판매 수량 순위

**품절 토글:**
- 헤더 또는 별도 탭에서 메뉴별 품절 on/off
- `food_menus.is_sold_out BOOLEAN` 컬럼 추가 필요
- 품절 메뉴는 FoodSections 모달에서 "품절" 표시 + 담기 비활성화

**로그아웃:** 세션 클리어 + `/booth/login` 리다이렉트

### 2-3. 어드민 부스 계정 관리

`src/pages/admin/AdminBoothAccounts.tsx`

- 부스 선택 + ID/PW 설정 → `booth_accounts` INSERT
- 계정 목록 (부스명, 로그인 ID, 생성일)
- 삭제 (부스당 계정 1개 원칙)
- PW 초기화

어드민 사이드바에 "매장 계정 관리" 추가 (KeyIcon)

---

## Phase 3 — 어드민 통계 + 엑셀 익스포트

### 3-1. 통계 페이지 (`/admin/statistics`)

`src/pages/admin/AdminStatistics.tsx`

**날짜 필터:** 전체 / 1일차 / 2일차 / 3일차 (행사 날짜 고정)

**섹션 1 — 요약 카드**
- 총 거래액
- 총 주문 건수
- 평균 객단가
- 총 판매 메뉴 수

**섹션 2 — 일별 매출 추이**
- Bar Chart (Recharts): x축 일자, y축 매출액
- 3일 각각 + 총합

**섹션 3 — 시간대별 매출**
- Line Chart: x축 시간(1시간 단위), y축 매출
- 피크 타임 자동 표시

**섹션 4 — 부스별 매출 순위**
- Bar Chart (수평): 부스명, 매출액, 주문 건수
- 클릭 시 해당 부스 상세 드릴다운

**섹션 5 — 카테고리별 비중**
- Pie Chart: 한식 / 중식 / 일식 / 퓨전

**섹션 6 — 인기 메뉴 TOP 10**
- 테이블: 순위, 메뉴명, 부스명, 판매수량, 매출액

### 3-2. 엑셀 익스포트

```
npm install xlsx
```

익스포트 버튼 클릭 시 다운로드되는 파일: `설악무산문화축전_음식페스티벌_매출통계.xlsx`

**시트 구성:**
1. `요약` — 핵심 지표 카드 데이터
2. `일별매출` — 날짜별 집계
3. `시간대별매출` — 1시간 단위 집계
4. `부스별매출` — 부스 전체 정산 데이터
5. `전체주문내역` — orders + order_items 원본 (정산 근거)

---

## 공통 주의사항

### 스타일
- CSS Modules 사용 (인라인 스타일 금지)
- 기존 `--text-cq-*` 시맨틱 토큰 사용 (festival 페이지 내 컴포넌트)
- `--color-*`, `--space-*` 토큰 준수
- 새 페이지 BottomNav/Header는 기존 Layout 컴포넌트 재사용

### 타입
- 신규 테이블 모두 `src/types/database.ts` 에 Row/Insert/Update 등록
- **빌드 검증은 반드시 `npm run build`** (`tsc --noEmit` 아님 — project references 차이로 vercel 빌드 실패 가능)

### 토스페이먼츠
- 테스트 키로 먼저 구현, 라이브 키는 환경변수 분리 (`VITE_TOSS_CLIENT_KEY`)
- 결제 승인 로직은 클라이언트 직접 호출 (테스트) → 추후 Edge Function 이전 검토
- 주문번호(`orderId`)는 토스에 넘기기 전에 반드시 DB에 먼저 INSERT

### Realtime
- 부스 대시보드 + 주문 상태 페이지 모두 Supabase Realtime 사용
- `order_items` 테이블 Realtime 활성화 필요 (Supabase 대시보드에서 설정)

### 보안
- `booth_accounts` 패스워드는 bcrypt 해싱 (Supabase Edge Function 또는 `bcryptjs` 클라이언트)
- 부스 대시보드는 sessionStorage 세션 체크 → 미로그인 시 `/booth/login` 리다이렉트

---

## 작업 순서 권고

```
Phase 1 (주문/결제 코어)
├─ DB 테이블 생성 (SQL)
├─ cartStore 구현
├─ FoodSections 모달 "담기" 버튼 추가
├─ CartPage
├─ CheckoutPage + 토스페이먼츠 연동
└─ OrderStatusPage (Realtime)

Phase 2 (매장 페이지)
├─ food_menus.is_sold_out 컬럼 추가
├─ BoothLoginPage
├─ BoothDashboardPage (Realtime)
└─ AdminBoothAccounts

Phase 3 (통계)
├─ AdminStatistics (Recharts)
└─ 엑셀 익스포트
```

각 Phase 완료 후 핸드오프 문서 업데이트 및 `npm run build` 성공 확인 후 다음 Phase 진행.
