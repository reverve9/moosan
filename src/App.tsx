import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from '@/components/layout/Layout'
import AdminLayout from '@/components/admin/AdminLayout'
import HomePage from '@/pages/HomePage'
import SchedulePage from '@/pages/SchedulePage'
import ProgramsPage from '@/pages/ProgramsPage'
import ApplyPage from '@/pages/ApplyPage'
import LocationPage from '@/pages/LocationPage'
import NoticePage from '@/pages/NoticePage'
import CartPage from '@/pages/CartPage'
import CheckoutPage from '@/pages/CheckoutPage'
import CheckoutSuccessPage from '@/pages/CheckoutSuccessPage'
import CheckoutFailPage from '@/pages/CheckoutFailPage'
import OrderStatusPage from '@/pages/OrderStatusPage'
import ProgramDetailPage from '@/pages/program/ProgramDetailPage'
import FestivalPage from '@/pages/program/FestivalPage'
import AdminDashboard from '@/pages/admin/AdminDashboard'
import AdminApplications from '@/pages/admin/AdminApplications'
import AdminFestivals from '@/pages/admin/AdminFestivals'
import AdminPrograms from '@/pages/admin/AdminPrograms'
import AdminFood from '@/pages/admin/AdminFood'
import AdminBoothAccounts from '@/pages/admin/AdminBoothAccounts'
import AdminMonitor from '@/pages/admin/AdminMonitor'
import AdminNotices from '@/pages/admin/AdminNotices'
import BoothLoginPage from '@/pages/booth/BoothLoginPage'
import BoothDashboardPage from '@/pages/booth/BoothDashboardPage'
import FloatingInstallButton from '@/components/pwa/FloatingInstallButton'
import { CartProvider } from '@/store/cartStore'
import { ToastProvider } from '@/components/ui/Toast'

/**
 * Hostname 기반 앱 모드 분기.
 * - booth.* → 가맹점 운영용 (태블릿)
 * - admin.* → 운영자 어드민
 * - 그 외 → 손님용 (PWA)
 *
 * dev: http://booth.localhost:5173 / http://admin.localhost:5173 / http://localhost:5173
 * prod: booth.moosanfesta.com / admin.moosanfesta.com / app.moosanfesta.com
 */
type AppMode = 'booth' | 'admin' | 'customer'

function getAppMode(): AppMode {
  if (typeof window === 'undefined') return 'customer'
  const host = window.location.hostname
  if (host.startsWith('booth.')) return 'booth'
  if (host.startsWith('admin.')) return 'admin'
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
        <Route index element={<AdminDashboard />} />
        <Route path="applications" element={<AdminApplications />} />
        <Route path="festivals" element={<AdminFestivals />} />
        <Route path="programs" element={<AdminPrograms />} />
        <Route path="food" element={<AdminFood />} />
        <Route path="booth-accounts" element={<AdminBoothAccounts />} />
        <Route path="monitor" element={<AdminMonitor />} />
        <Route path="notices" element={<AdminNotices />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
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
        <Route path="/location" element={<LocationPage />} />
        <Route path="/notice" element={<NoticePage />} />
        <Route path="/cart" element={<CartPage />} />
        <Route path="/checkout" element={<CheckoutPage />} />
        <Route path="/checkout/success" element={<CheckoutSuccessPage />} />
        <Route path="/checkout/fail" element={<CheckoutFailPage />} />
        <Route path="/order/:id" element={<OrderStatusPage />} />
        {/* Festival 페이지: musan / food / youth — 같은 컴포넌트 공유 */}
        <Route path="/program/youth" element={<FestivalPage slug="youth" />} />
        <Route path="/program/musan" element={<FestivalPage slug="musan" />} />
        <Route path="/program/food" element={<FestivalPage slug="food" />} />
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
