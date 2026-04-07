import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from '@/components/layout/Layout'
import AdminLayout from '@/components/admin/AdminLayout'
import HomePage from '@/pages/HomePage'
import SchedulePage from '@/pages/SchedulePage'
import ProgramsPage from '@/pages/ProgramsPage'
import ApplyPage from '@/pages/ApplyPage'
import LocationPage from '@/pages/LocationPage'
import NoticePage from '@/pages/NoticePage'
import ProgramDetailPage from '@/pages/program/ProgramDetailPage'
import FestivalPage from '@/pages/program/FestivalPage'
import AdminDashboard from '@/pages/admin/AdminDashboard'
import AdminApplications from '@/pages/admin/AdminApplications'
import AdminFestivals from '@/pages/admin/AdminFestivals'
import AdminPrograms from '@/pages/admin/AdminPrograms'
import AdminFood from '@/pages/admin/AdminFood'
import AdminNotices from '@/pages/admin/AdminNotices'

export default function App() {
  return (
    <BrowserRouter>
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
          {/* Festival 페이지: musan / food / youth — 같은 컴포넌트 공유 */}
          <Route path="/program/youth" element={<FestivalPage slug="youth" />} />
          <Route path="/program/musan" element={<FestivalPage slug="musan" />} />
          <Route path="/program/food" element={<FestivalPage slug="food" />} />
          <Route path="/program/:slug" element={<ProgramDetailPage />} />
        </Route>

        {/* Admin */}
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<AdminDashboard />} />
          <Route path="applications" element={<AdminApplications />} />
          <Route path="festivals" element={<AdminFestivals />} />
          <Route path="programs" element={<AdminPrograms />} />
          <Route path="food" element={<AdminFood />} />
          <Route path="notices" element={<AdminNotices />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
