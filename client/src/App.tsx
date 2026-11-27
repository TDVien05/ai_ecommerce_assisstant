import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import AppPage from '@/pages/AppPage'
import HomePage from '@/pages/HomePage'
import DesignSystemPage from '@/pages/DesignSystemPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/design-system" element={<DesignSystemPage />} />
        <Route path="/status" element={<HomePage />} />
        <Route path="/*" element={<AppPage />} />
      </Routes>
      <Toaster />
    </BrowserRouter>
  )
}
