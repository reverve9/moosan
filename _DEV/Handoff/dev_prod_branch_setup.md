> 🛎 **세션 시작 시 먼저 확인** — 이 프로젝트는 2026-04-10 부터 `main`(프로덕션) / `dev`(개발) 브랜치가 분리되어 운영됩니다. 모든 작업은 **`dev` 브랜치**에서만 진행하세요. `main` push는 프로덕션 오픈 확정 시점에만 `git merge dev` 방식으로. 프롬프트에 `git:dev` 표시 확인 후 작업.

# 개발/프로덕션 환경 분리

## 배경

월요일 부분 오픈 예정. 일부 페이지만 프로덕션 오픈하고 나머지는 계속 개발 필요.
로컬 외 실제 환경에서 개발 테스트가 필요한 상황.

---

## 확정 구조

| 구분 | GitHub 브랜치 | Vercel 프로젝트 | 도메인 |
|------|-------------|----------------|--------|
| 프로덕션 | `main` | musanfesta | musanfesta.com |
| 개발 | `dev` | musanfesta-dev | Vercel 자동 URL |

---

## 1. GitHub 브랜치 생성

```bash
git checkout -b dev
git push origin dev
```

---

## 2. Vercel 프로젝트 신규 생성 (musanfesta-dev)

1. Vercel 대시보드 → Add New Project
2. 같은 GitHub repo (`reverve9/moosan`) 연결
3. **Production Branch: `dev`** 로 설정
4. 환경변수 기존 musanfesta와 동일하게 설정
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_TOSS_CLIENT_KEY`
   - `TOSS_SECRET_KEY`
5. 추가 환경변수: `VITE_DEV_MODE=true`

---

## 3. 준비중 페이지 처리 (`main` 브랜치)

### ComingSoonPage 신규

`src/pages/ComingSoonPage.tsx`

```tsx
// 단순하게
export default function ComingSoonPage() {
  return (
    <div>
      <p>준비 중입니다</p>
      <Link to="/">홈으로</Link>
    </div>
  );
}
```

### App.tsx 라우트 분기

```tsx
const isDev = import.meta.env.VITE_DEV_MODE === 'true';

// 준비중 라우트
<Route path="/program/food" element={isDev ? <FoodPage slug="food" /> : <ComingSoonPage />} />
<Route path="/cart" element={isDev ? <CartPage /> : <ComingSoonPage />} />
<Route path="/checkout" element={isDev ? <CheckoutPage /> : <ComingSoonPage />} />
<Route path="/checkout/success" element={isDev ? <CheckoutSuccessPage /> : <ComingSoonPage />} />
<Route path="/checkout/fail" element={isDev ? <CheckoutFailPage /> : <ComingSoonPage />} />
<Route path="/order/:id" element={isDev ? <OrderStatusPage /> : <ComingSoonPage />} />
<Route path="/booth/*" element={isDev ? <BoothRoutes /> : <ComingSoonPage />} />
<Route path="/survey" element={isDev ? <SurveyPage /> : <ComingSoonPage />} />
<Route path="/coupon/lookup" element={isDev ? <CouponLookupPage /> : <ComingSoonPage />} />
```

### 오픈 라우트 (isDev 분기 없음, 그대로 유지)
- `/` — 홈
- `/program/musan`
- `/program/youth`
- `/apply/*`
- `/notice`
- `/location`
- `/admin/*`

---

## 4. BottomNav 음식문화페스티벌 탭

```tsx
// 음식 탭 클릭 시
isDev ? navigate('/program/food') : navigate('/')
// 또는 아예 탭 비활성화 처리
```

---

## 5. 작업 흐름

```
dev 브랜치에서 작업
→ push → musanfesta-dev 자동 배포
→ Vercel URL에서 실제 환경 테스트
→ 기능 완성 시 main에 머지
→ musanfesta.com 프로덕션 반영
→ dev 브랜치는 계속 유지하며 다음 작업
```

```bash
# 완성된 기능 머지
git checkout main
git merge dev
git push origin main

# 이후 다시 dev로 돌아와서 작업 계속
git checkout dev
```

---

## 6. 주의사항

- `VITE_DEV_MODE` 는 musanfesta (프로덕션) Vercel 프로젝트에 **절대 추가하지 말 것**
- 로컬 `.env` 에 `VITE_DEV_MODE=true` 추가 → 로컬에서도 전체 기능 테스트 가능
- `.env.example` 에 `VITE_DEV_MODE=false` 추가
- 어드민(`/admin/*`)은 항상 오픈 — isDev 분기 불필요
- 빌드 검증은 `npm run build`
