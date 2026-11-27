import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import HomePage from '@/pages/HomePage'
import DesignSystemPage from '@/pages/DesignSystemPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/design-system" element={<DesignSystemPage />} />
      </Routes>
      <Toaster />
    </BrowserRouter>
  )
}
