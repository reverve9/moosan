import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from '@/components/layout/Layout'
import HomePage from '@/pages/HomePage'
import ProgramDetailPage from '@/pages/program/ProgramDetailPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/program/:slug" element={<ProgramDetailPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
