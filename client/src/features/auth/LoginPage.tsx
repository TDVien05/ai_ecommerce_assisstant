import { useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ApiError } from '@/lib/api'
import { useAuth } from './useAuth'

export default function LoginPage() {
  const { session, loading, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  if (!loading && session) return <Navigate to="/" replace />
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setSubmitting(true)
    try { await login({ email, password }); navigate(location.state?.from || '/', { replace: true }) }
    catch (err) { setError(err instanceof ApiError ? err.message : 'Không thể đăng nhập. Kiểm tra kết nối và thử lại.') }
    finally { setSubmitting(false) }
  }
  return <main className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
    <div className="w-full max-w-sm border border-border p-6">
      <p className="text-sm font-semibold">Flowy</p>
      <h1 className="mt-6 text-2xl font-semibold">Đăng nhập</h1>
      <p className="mt-2 text-sm text-muted-foreground">Đăng nhập để tiếp tục quản lý cửa hàng.</p>
      <form className="mt-6 space-y-4" onSubmit={submit}>
        <div className="space-y-2"><label htmlFor="email">Email</label><Input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div className="space-y-2"><label htmlFor="password">Mật khẩu</label><Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={submitting || loading}>{submitting ? 'Đang đăng nhập…' : 'Đăng nhập'}</Button>
      </form>
    </div>
  </main>
}
