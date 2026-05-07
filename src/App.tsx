import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from '@/components/layout/Layout'
import AdminLayout from '@/components/admin/AdminLayout'
import HomePage from '@/pages/HomePage'
import SchedulePage from '@/pages/SchedulePage'
import ProgramsPage from '@/pages/ProgramsPage'
import ApplyPage from '@/pages/ApplyPage'
import LocationPage from '@/pages/LocationPage'
import NoticePage from '@/pages/NoticePage'
import NoticeDetailPage from '@/pages/NoticeDetailPage'
// [비상 비활성 — 만족도조사] 원복 시 주석 해제
// import SurveyPage from '@/pages/SurveyPage'
import CartPage from '@/pages/CartPage'
import CheckoutPage from '@/pages/CheckoutPage'
import CheckoutSuccessPage from '@/pages/CheckoutSuccessPage'
import CheckoutFailPage from '@/pages/CheckoutFailPage'
import OrderStatusPage from '@/pages/OrderStatusPage'
import ComingSoonPage from '@/pages/ComingSoonPage'
import { isDevMode } from '@/config/flags'
import ProgramDetailPage from '@/pages/program/ProgramDetailPage'
import FestivalPage from '@/pages/program/FestivalPage'
import AdminRevenue from '@/pages/admin/AdminRevenue'
import AdminSettlement from '@/pages/admin/settlement/AdminSettlement'
import AdminSurvey from '@/pages/admin/AdminSurvey'
import AdminApplications from '@/pages/admin/AdminApplications'
import AdminContentDetail from '@/pages/admin/AdminContentDetail'
import AdminFood from '@/pages/admin/AdminFood'
import AdminBoothAccounts from '@/pages/admin/AdminBoothAccounts'
import AdminMonitor from '@/pages/admin/AdminMonitor'
import AdminOrders from '@/pages/admin/AdminOrders'
import AdminCoupons from '@/pages/admin/AdminCoupons'
import AdminNotices from '@/pages/admin/AdminNotices'
import AdminQRCodes from '@/pages/admin/AdminQRCodes'
import BoothLoginPage from '@/pages/booth/BoothLoginPage'
import BoothDashboardPage from '@/pages/booth/BoothDashboardPage'
import FloatingInstallButton from '@/components/pwa/FloatingInstallButton'
import { CartProvider } from '@/store/cartStore'
import { ToastProvider } from '@/components/ui/Toast'

/**
 * Hostname 기반 앱 모드 분기.
 * - booth.* or *-booth.* → 가맹점 운영용 (태블릿)
 * - admin.* or *-admin.* → 운영자 어드민
 * - 그 외 → 손님용 (PWA)
 *
 * dev  : booth.localhost:5173 / admin.localhost:5173 / localhost:5173
 * prod : booth.musanfesta.com / admin.musanfesta.com / musanfesta.com
 * vercel: musanfesta.vercel.app (통합 프로젝트 자동 URL — 손님 모드만 매칭)
 */
type AppMode = 'booth' | 'admin' | 'customer'

function getAppMode(): AppMode {
  if (typeof window === 'undefined') return 'customer'
  const host = window.location.hostname.toLowerCase()
  if (host.startsWith('booth.') || host.includes('-booth.')) return 'booth'
  if (host.startsWith('admin.') || host.includes('-admin.')) return 'admin'
  return 'customer'
}

const APP_MODE: AppMode = getAppMode()

function BoothRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<BoothLoginPage />} />
      <Route path="/dashboard" element={<BoothDashboardPage />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}

function AdminRoutes() {
  return (
    <Routes>
      <Route path="/" element={<AdminLayout />}>
        <Route index element={<Navigate to="/notices" replace />} />
        <Route path="notices" element={<AdminNotices />} />
        <Route path="applications" element={<AdminApplications />} />
        <Route path="coupons" element={<AdminCoupons />} />
        <Route path="revenue" element={<AdminRevenue />} />
        <Route path="settlement" element={<AdminSettlement />} />
        <Route path="survey" element={<AdminSurvey />} />
        <Route path="content/musan" element={<AdminContentDetail slug="musan" />} />
        <Route path="content/youth" element={<AdminContentDetail slug="youth" />} />
        <Route path="content/food" element={<AdminContentDetail slug="food" />} />
        <Route path="food" element={<AdminFood />} />
        <Route path="booth-accounts" element={<AdminBoothAccounts />} />
        <Route path="monitor" element={<AdminMonitor />} />
        <Route path="orders" element={<AdminOrders />} />
        <Route path="qrcodes" element={<AdminQRCodes />} />
      </Route>
      <Route path="*" element={<Navigate to="/notices" replace />} />
    </Routes>
  )
}

function CustomerRoutes() {
  return (
    <Routes>
      {/* Home (standalone: hero + footer) */}
      <Route path="/" element={<HomePage />} />

      {/* User */}
      <Route element={<Layout />}>
        <Route path="/schedule" element={<SchedulePage />} />
        <Route path="/programs" element={<ProgramsPage />} />
        <Route path="/apply" element={<ApplyPage />} />
        <Route path="/apply/:slug" element={<ApplyPage />} />
        {/* [비상 비활성 — 만족도조사] 원복 시 주석 해제 */}
        {/* <Route path="/survey" element={isDevMode ? <SurveyPage /> : <ComingSoonPage />} /> */}
        <Route path="/survey" element={<ComingSoonPage />} />
        <Route path="/location" element={isDevMode ? <LocationPage /> : <ComingSoonPage />} />
        <Route path="/notice" element={<NoticePage />} />
        <Route path="/notice/:id" element={<NoticeDetailPage />} />
        <Route path="/cart" element={isDevMode ? <CartPage /> : <ComingSoonPage />} />
        <Route path="/checkout" element={isDevMode ? <CheckoutPage /> : <ComingSoonPage />} />
        <Route path="/checkout/success" element={isDevMode ? <CheckoutSuccessPage /> : <ComingSoonPage />} />
        <Route path="/checkout/fail" element={isDevMode ? <CheckoutFailPage /> : <ComingSoonPage />} />
        <Route path="/order/:id" element={isDevMode ? <OrderStatusPage /> : <ComingSoonPage />} />
        {/* Festival 페이지: musan / food / youth — 같은 컴포넌트 공유 */}
        <Route path="/program/youth" element={<FestivalPage slug="youth" />} />
        <Route path="/program/musan" element={<FestivalPage slug="musan" />} />
        <Route path="/program/food" element={isDevMode ? <FestivalPage slug="food" /> : <ComingSoonPage />} />
        <Route path="/program/:slug" element={<ProgramDetailPage />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <CartProvider>
        <BrowserRouter>
          {APP_MODE === 'customer' && <FloatingInstallButton />}
          {APP_MODE === 'booth' && <BoothRoutes />}
          {APP_MODE === 'admin' && <AdminRoutes />}
          {APP_MODE === 'customer' && <CustomerRoutes />}
        </BrowserRouter>
      </CartProvider>
    </ToastProvider>
  )
}
