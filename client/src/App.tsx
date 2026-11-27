import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import AppPage from '@/pages/AppPage'
import HomePage from '@/pages/HomePage'
import DesignSystemPage from '@/pages/DesignSystemPage'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { RequireAuth } from '@/features/auth/RequireAuth'
import LoginPage from '@/features/auth/LoginPage'
import { LandingPage, RegisterPage, TermsPage } from '@/features/auth/PublicPages'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider><Routes>
        <Route path="/design-system" element={<DesignSystemPage />} />
        <Route path="/status" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/" element={<LandingPage />} />
        <Route path="/*" element={<RequireAuth><AppPage /></RequireAuth>} />
      </Routes></AuthProvider>
      <Toaster />
    </BrowserRouter>
  )
}
