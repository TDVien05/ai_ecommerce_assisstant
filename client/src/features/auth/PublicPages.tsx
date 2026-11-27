import { useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { AssistantMessage, Block, BlockBody, UserMessage } from '@/components/flowy'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuth } from './useAuth'

export function PublicShell({ children }: { children: ReactNode }) {
  const { resolvedTheme, setTheme } = useTheme()
  return <div className="min-h-screen bg-background text-foreground"><header className="border-b"><div className="mx-auto flex max-w-6xl items-center gap-4 px-5 py-4"><Link to="/" className="font-semibold">Flowy</Link><span className="flex-1" /><Link to="/login" className="text-sm underline underline-offset-4">Đăng nhập</Link><Link to="/register" className="text-sm underline underline-offset-4">Đăng ký</Link><Button variant="ghost" size="icon" aria-label="Đổi giao diện sáng/tối" onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}>{resolvedTheme === 'dark' ? <Sun /> : <Moon />}</Button></div></header>{children}<footer className="border-t px-5 py-6 text-center text-sm text-muted-foreground">Flowy · Trợ lý vận hành cửa hàng · <Link className="underline" to="/terms">Điều khoản</Link></footer></div>
}

export function LandingPage() {
  const { session, loading, demo } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  if (!loading && session) return <Navigate to="/app" replace />
  async function enterDemo() { setBusy(true); setError(''); try { await demo(); navigate('/app', { replace: true }) } catch (err) { setError(err instanceof Error ? err.message : 'Không thể mở tài khoản demo.') } finally { setBusy(false) } }
  return <PublicShell><main className="mx-auto max-w-6xl px-5 py-12"><div className="grid items-center gap-10 md:grid-cols-2"><div><p className="text-sm font-semibold">FLOWY · TRỢ LÝ CHO HỘ KINH DOANH</p><h1 className="mt-4 text-[28px] leading-tight font-semibold">Quản lý dòng tiền, rõ từng việc mỗi ngày</h1><p className="mt-4 text-base text-muted-foreground">Flowy giúp bạn theo dõi giao dịch, đơn hàng và sổ thu chi trong một nơi. Mọi thay đổi do AI đề xuất đều chờ bạn duyệt.</p><div className="mt-6 flex flex-wrap gap-2"><Button onClick={enterDemo} disabled={busy || loading}>{busy ? 'Đang mở tài khoản…' : 'Dùng thử với tài khoản demo'}</Button><Button variant="outline" render={<Link to="/register" />}>Đăng ký</Button><Button variant="ghost" render={<Link to="/login" />}>Đăng nhập</Button></div>{error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}</div><Block><BlockBody><div className="space-y-5"><p className="border-b pb-3 font-semibold">Chat trung tâm</p><UserMessage>Hôm nay cửa hàng có việc gì cần xem?</UserMessage><AssistantMessage>Mình sẽ giúp bạn theo dõi giao dịch và nhắc những việc cần kiểm tra. Bạn duyệt trước khi mình ghi thay đổi.</AssistantMessage></div></BlockBody></Block></div><section className="mt-12"><h2 className="text-base font-semibold">Các việc Flowy hỗ trợ</h2><div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[['Thư ký chủ động', 'Theo dõi công việc và nhắc khi cần bạn xem.'], ['Giao dịch rõ ràng', 'Đối chiếu giao dịch, tách khoản kinh doanh và cá nhân.'], ['Sổ thu chi', 'Theo dõi và xem các mẫu sổ tham khảo.'], ['Cảnh báo đơn hàng', 'Nhắc kiểm tra đơn có dấu hiệu bất thường.']].map(([title, body]) => <div key={title} className="border p-4"><h3 className="font-semibold">{title}</h3><p className="mt-2 text-sm text-muted-foreground">{body}</p></div>)}</div></section></main></PublicShell>
}

export function RegisterPage() {
  const { session, loading, register } = useAuth()
  const navigate = useNavigate()
  const [ownerName, setOwner] = useState(''); const [shopName, setShop] = useState(''); const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [confirm, setConfirm] = useState(''); const [acceptedTerms, setTerms] = useState(false); const [show, setShow] = useState(false); const [error, setError] = useState(''); const [busy, setBusy] = useState(false)
  if (!loading && session) return <Navigate to="/app" replace />
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setError(''); if (password !== confirm) return setError('Mật khẩu xác nhận chưa khớp.'); if (password.length < 8) return setError('Mật khẩu cần ít nhất 8 ký tự.'); setBusy(true); try { await register({ ownerName, shopName, email, password, acceptedTerms }); navigate('/app', { replace: true }) } catch (err) { setError(err instanceof Error ? err.message : 'Không thể đăng ký. Vui lòng thử lại.') } finally { setBusy(false) } }
  return <PublicShell><main className="mx-auto max-w-md px-5 py-10"><h1 className="text-[22px] font-semibold">Tạo tài khoản</h1><p className="mt-2 text-sm text-muted-foreground">Bắt đầu với cửa hàng của bạn.</p><form className="mt-6 space-y-4" onSubmit={submit}>
    <Field label="Tên chủ hộ" id="owner" value={ownerName} onChange={setOwner} autoComplete="name" /><Field label="Tên cửa hàng" id="shop" value={shopName} onChange={setShop} /><Field label="Email" id="register-email" value={email} onChange={setEmail} type="email" autoComplete="email" /><Field label="Mật khẩu" id="register-password" value={password} onChange={setPassword} type={show ? 'text' : 'password'} autoComplete="new-password" /><Field label="Xác nhận mật khẩu" id="confirm-password" value={confirm} onChange={setConfirm} type={show ? 'text' : 'password'} autoComplete="new-password" />
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Hiện mật khẩu</label><label className="flex items-start gap-2 text-sm"><input type="checkbox" required checked={acceptedTerms} onChange={(e) => setTerms(e.target.checked)} /> <span>Tôi đồng ý với <Link className="underline" to="/terms" target="_blank">điều khoản sử dụng</Link>.</span></label>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<Button className="w-full" type="submit" disabled={busy || loading}>{busy ? 'Đang tạo tài khoản…' : 'Đăng ký'}</Button><p className="text-sm">Đã có tài khoản? <Link className="underline" to="/login">Đăng nhập</Link></p></form></main></PublicShell>
}

export function Field({ label, id, value, onChange, type = 'text', autoComplete }: { label: string; id: string; value: string; onChange: (value: string) => void; type?: string; autoComplete?: string }) { return <div className="space-y-2"><label htmlFor={id}>{label}</label><Input id={id} type={type} value={value} required autoComplete={autoComplete} onChange={(e) => onChange(e.target.value)} /></div> }

export function TermsPage() { return <PublicShell><main className="mx-auto max-w-2xl space-y-4 px-5 py-10"><h1 className="text-[22px] font-semibold">Điều khoản sử dụng</h1><p className="text-sm text-muted-foreground">Bản nháp, đang chờ hoàn thiện.</p><p>Flowy là sản phẩm dự thi, hỗ trợ hộ kinh doanh theo dõi hoạt động cửa hàng.</p><p>Dữ liệu bạn cung cấp được dùng để vận hành ứng dụng; nhóm không bán dữ liệu này.</p><p>AI có thể đưa ra thông tin chưa chính xác. Chủ hộ cần kiểm tra và chịu trách nhiệm về quyết định cuối cùng.</p><p>Liên hệ nhóm phát triển Flowy để được hỗ trợ.</p></main></PublicShell> }
