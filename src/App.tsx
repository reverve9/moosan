import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from '@/components/layout/Layout'
import HomePage from '@/pages/HomePage'
import ProgramsPage from '@/pages/ProgramsPage'
import ApplyPage from '@/pages/ApplyPage'
import LocationPage from '@/pages/LocationPage'
import NoticePage from '@/pages/NoticePage'
import ProgramDetailPage from '@/pages/program/ProgramDetailPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/programs" element={<ProgramsPage />} />
          <Route path="/apply" element={<ApplyPage />} />
          <Route path="/location" element={<LocationPage />} />
          <Route path="/notice" element={<NoticePage />} />
          <Route path="/program/:slug" element={<ProgramDetailPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
