import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuth } from './useAuth'
import { AuthLayout } from './PublicPages'

export default function LoginPage() {
  const { session, loading, login, demo } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [show, setShow] = useState(false)
  const destination = typeof location.state?.from === 'string' && location.state.from.startsWith('/') && !location.state.from.startsWith('//') ? location.state.from : '/app'
  if (!loading && session) return <Navigate to={destination} replace />
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setSubmitting(true)
    try { await login({ email, password }); navigate(destination, { replace: true }) }
    catch (err) { setError(err instanceof Error ? err.message : 'Không thể đăng nhập. Kiểm tra kết nối và thử lại.') }
    finally { setSubmitting(false) }
  }
  async function enterDemo() { setError(''); setSubmitting(true); try { await demo(); navigate(destination, { replace: true }) } catch (err) { setError(err instanceof Error ? err.message : 'Không thể mở tài khoản demo.') } finally { setSubmitting(false) } }
  return <AuthLayout>
    <div className="w-full max-w-sm">
      <h1 className="text-[22px] font-semibold">Đăng nhập</h1>
      <p className="mt-2 text-sm text-muted-foreground">Đăng nhập để tiếp tục quản lý cửa hàng.</p>
      <form className="mt-6 space-y-4" onSubmit={submit}>
        <div className="space-y-2"><label htmlFor="email">Email</label><Input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div className="space-y-2"><label htmlFor="password">Mật khẩu</label><Input id="password" type={show ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Hiện mật khẩu</label>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={submitting || loading}>{submitting ? 'Đang đăng nhập…' : 'Đăng nhập'}</Button>
      </form>
      <Button variant="outline" className="mt-3 w-full" onClick={enterDemo} disabled={submitting || loading}>Vào bằng tài khoản demo</Button>
      <p className="mt-4 text-sm">Chưa có tài khoản? <Link className="underline" to="/register">Đăng ký</Link></p>
    </div>
  </AuthLayout>
}
