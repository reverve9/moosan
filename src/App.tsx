import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from '@/components/layout/Layout'
import AdminLayout from '@/components/admin/AdminLayout'
import HomePage from '@/pages/HomePage'
import ProgramsPage from '@/pages/ProgramsPage'
import ApplyPage from '@/pages/ApplyPage'
import LocationPage from '@/pages/LocationPage'
import NoticePage from '@/pages/NoticePage'
import ProgramDetailPage from '@/pages/program/ProgramDetailPage'
import AdminDashboard from '@/pages/admin/AdminDashboard'
import AdminApplications from '@/pages/admin/AdminApplications'
import AdminPrograms from '@/pages/admin/AdminPrograms'
import AdminNotices from '@/pages/admin/AdminNotices'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* User */}
        <Route element={<Layout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/programs" element={<ProgramsPage />} />
          <Route path="/apply" element={<ApplyPage />} />
          <Route path="/location" element={<LocationPage />} />
          <Route path="/notice" element={<NoticePage />} />
          <Route path="/program/:slug" element={<ProgramDetailPage />} />
        </Route>

        {/* Admin */}
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<AdminDashboard />} />
          <Route path="applications" element={<AdminApplications />} />
          <Route path="programs" element={<AdminPrograms />} />
          <Route path="notices" element={<AdminNotices />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
