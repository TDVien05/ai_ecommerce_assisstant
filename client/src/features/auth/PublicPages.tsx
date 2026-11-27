import { useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { BookOpen, ChartNoAxesCombined, MessageSquare, Moon, ShieldAlert, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { AgentStep, AssistantMessage, Block, BlockBody, ResultCard, RiskBadge, UserMessage } from '@/components/flowy'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { localFixture } from '@/lib/mockServer/localFixture'
import { useAuth } from './useAuth'

export function PublicShell({ children }: { children: ReactNode }) {
  const { resolvedTheme, setTheme } = useTheme()
  return <div className="flex min-h-dvh flex-col bg-background text-foreground">
    <header className="shrink-0 border-b"><div className="mx-auto flex max-w-6xl items-center gap-2 px-5 py-3">
      <Link to="/" className="flex items-center gap-2 font-semibold"><span className="grid size-6 place-items-center bg-primary text-xs text-primary-foreground">F</span>Flowy</Link>
      <span className="flex-1" />
      <Button variant="outline" className="h-9 rounded-none" render={<Link to="/login" />}>Đăng nhập</Button>
      <Button className="h-9 rounded-none" render={<Link to="/register" />}>Đăng ký</Button>
      <Button variant="ghost" size="icon" aria-label="Đổi giao diện sáng/tối" onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}>{resolvedTheme === 'dark' ? <Sun /> : <Moon />}</Button>
    </div></header>
    {children}
    <footer className="shrink-0 border-t px-5 py-3 text-center text-xs text-muted-foreground">Flowy · Trợ lý vận hành cửa hàng · <Link className="underline" to="/terms">Điều khoản</Link></footer>
  </div>
}

const features = [
  { icon: MessageSquare, title: 'Thư ký chủ động', body: 'Theo dõi công việc và nhắc khi cần bạn xem.' },
  { icon: ChartNoAxesCombined, title: 'Giao dịch rõ ràng', body: 'Tách khoản kinh doanh và cá nhân.' },
  { icon: BookOpen, title: 'Sổ thu chi', body: 'Xem các mẫu sổ tham khảo.' },
  { icon: ShieldAlert, title: 'Cảnh báo đơn hàng', body: 'Nhắc kiểm tra dấu hiệu bất thường.' },
]

/** Dữ liệu minh họa, không kết nối cửa hàng hay thực hiện thay đổi. */
function ChatPreview() {
  return <section aria-label="Minh họa chat Flowy" className="border bg-card text-sm">
    <div className="flex items-center justify-between border-b px-4 py-2"><span className="font-semibold">Chat trung tâm</span><span className="flex items-center gap-2 text-xs text-muted-foreground"><span className="size-2 bg-foreground" />Flowy đang theo dõi</span></div>
    <div className="flex flex-col gap-2 px-4 py-3">
      <UserMessage>Hôm nay cửa hàng có gì cần xem?</UserMessage>
      <AssistantMessage>
        <Block tone="danger"><BlockBody><div className="flex flex-wrap items-center justify-between gap-1"><strong>Đơn có dấu hiệu bất thường</strong><RiskBadge level="high" /></div><p className="text-xs text-muted-foreground">Khách gửi ảnh chuyển khoản, ngân hàng chưa báo tiền vào.</p></BlockBody></Block>
        <div className="border p-2">{localFixture.landingRevenue ? <ResultCard metrics={[{ label: 'Doanh thu hôm nay', value: localFixture.landingRevenue.amount }]} source={localFixture.landingRevenue.source} updatedAt={localFixture.landingRevenue.updatedAt} how={[{ label: 'Doanh thu đã ghi', value: localFixture.landingRevenue.amount, total: true }]} /> : <p className="text-sm text-muted-foreground">Chưa có dữ liệu doanh thu.</p>}</div>
        <fieldset disabled aria-label="Ví dụ bước chờ duyệt"><AgentStep title="Ghi giao dịch vào sổ" state="waiting" steps={[]} approveLabel="Duyệt và ghi sổ" onApprove={() => {}} onSkip={() => {}} onUndo={() => {}} undoNote="Có thể hoàn tác sau khi ghi." /></fieldset>
      </AssistantMessage>
    </div>
    <div className="border-t px-4 py-2"><Input disabled aria-label="Ô nhập tin minh họa" placeholder="Nhắn cho Flowy…" /></div>
  </section>
}

export function LandingPage() {
  const { session, loading, demo } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  if (!loading && session) return <Navigate to="/app" replace />
  async function enterDemo() { setBusy(true); setError(''); try { await demo(); navigate('/app', { replace: true }) } catch (err) { setError(err instanceof Error ? err.message : 'Không thể mở tài khoản demo.') } finally { setBusy(false) } }
  return <PublicShell><main className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center gap-5 px-5 py-5">
    <div className="grid items-center gap-8 min-[860px]:grid-cols-2">
      <div><p className="text-xs font-semibold tracking-wide">FLOWY · TRỢ LÝ CHO HỘ KINH DOANH</p><h1 className="mt-3 text-[28px] leading-tight font-semibold">Quản lý dòng tiền, rõ từng việc mỗi ngày</h1><p className="mt-3 max-w-md text-base text-muted-foreground">Flowy giúp bạn theo dõi giao dịch, đơn hàng và sổ thu chi trong một nơi. Mọi thay đổi do AI đề xuất đều chờ bạn duyệt.</p>
        <div className="mt-5 grid max-w-md grid-cols-3 border text-sm">{[['1', 'chat trung tâm'], ['7', 'mẫu sổ theo TT 152'], ['3', 'mức rủi ro']].map(([value, label]) => <div key={label} className="border-r px-3 py-2 last:border-r-0"><strong className="block text-base">{value}</strong><span className="text-xs text-muted-foreground">{label}</span></div>)}</div>
        <div className="mt-5 flex flex-wrap gap-2"><Button size="lg" onClick={enterDemo} disabled={busy || loading}>{busy ? 'Đang mở tài khoản…' : 'Dùng thử với tài khoản demo'}</Button><Button size="lg" variant="outline" render={<Link to="/register" />}>Tạo tài khoản</Button></div>{error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
      </div><ChatPreview />
    </div>
    <section><h2 className="mb-2 text-sm font-semibold">Các việc Flowy hỗ trợ</h2><div className="grid grid-cols-2 gap-2 lg:grid-cols-4">{features.map(({ icon: Icon, title, body }) => <div key={title} className="border p-3"><Icon className="mb-2 size-4" strokeWidth={1.75} /><h3 className="text-sm font-semibold">{title}</h3><p className="mt-1 text-xs text-muted-foreground">{body}</p></div>)}</div></section>
  </main></PublicShell>
}

export function AuthLayout({ children }: { children: ReactNode }) {
  return <PublicShell><main className="mx-auto grid w-full max-w-5xl flex-1 items-center gap-8 px-5 py-6 min-[860px]:grid-cols-2"><div className="w-full max-w-md">{children}</div><aside className="hidden border-l pl-8 min-[860px]:block"><p className="text-xs font-semibold tracking-wide">CÙNG FLOWY MỖI NGÀY</p><h2 className="mt-3 text-[22px] font-semibold">Mọi việc của cửa hàng, rõ ràng hơn</h2><ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-muted-foreground"><li>Theo dõi giao dịch và sổ thu chi.</li><li>Nhận nhắc nhở khi có đơn cần kiểm tra.</li><li>Chủ động duyệt trước mọi thay đổi.</li></ul><div className="mt-6 border p-4"><AssistantMessage>Mình sẽ cùng bạn theo dõi cửa hàng và báo khi có việc cần xem.</AssistantMessage></div><p className="mt-2 text-xs text-muted-foreground">Nội dung minh họa</p></aside></main></PublicShell>
}

export function RegisterPage() {
  const { session, loading, register } = useAuth()
  const navigate = useNavigate()
  const [ownerName, setOwner] = useState(''); const [shopName, setShop] = useState(''); const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [confirm, setConfirm] = useState(''); const [acceptedTerms, setTerms] = useState(false); const [show, setShow] = useState(false); const [error, setError] = useState(''); const [busy, setBusy] = useState(false)
  if (!loading && session) return <Navigate to="/app" replace />
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setError(''); if (password !== confirm) return setError('Mật khẩu xác nhận chưa khớp.'); if (password.length < 8) return setError('Mật khẩu cần ít nhất 8 ký tự.'); setBusy(true); try { await register({ ownerName, shopName, email, password, acceptedTerms }); navigate('/app', { replace: true }) } catch (err) { setError(err instanceof Error ? err.message : 'Không thể đăng ký. Vui lòng thử lại.') } finally { setBusy(false) } }
  return <AuthLayout><h1 className="text-[22px] font-semibold">Tạo tài khoản</h1><p className="mt-1 text-sm text-muted-foreground">Bắt đầu với cửa hàng của bạn.</p><form className="mt-4 space-y-3" onSubmit={submit}>
    <Field label="Tên chủ hộ" id="owner" value={ownerName} onChange={setOwner} autoComplete="name" /><Field label="Tên cửa hàng" id="shop" value={shopName} onChange={setShop} /><Field label="Email" id="register-email" value={email} onChange={setEmail} type="email" autoComplete="email" />
    <div className="grid gap-3 sm:grid-cols-2"><Field label="Mật khẩu" id="register-password" value={password} onChange={setPassword} type={show ? 'text' : 'password'} autoComplete="new-password" /><Field label="Xác nhận mật khẩu" id="confirm-password" value={confirm} onChange={setConfirm} type={show ? 'text' : 'password'} autoComplete="new-password" /></div>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Hiện mật khẩu</label><label className="flex items-start gap-2 text-sm"><input type="checkbox" required checked={acceptedTerms} onChange={(e) => setTerms(e.target.checked)} /> <span>Tôi đồng ý với <Link className="underline" to="/terms" target="_blank">điều khoản sử dụng</Link>.</span></label>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<Button className="w-full" type="submit" disabled={busy || loading}>{busy ? 'Đang tạo tài khoản…' : 'Đăng ký'}</Button><p className="text-sm">Đã có tài khoản? <Link className="underline" to="/login">Đăng nhập</Link></p></form></AuthLayout>
}

export function Field({ label, id, value, onChange, type = 'text', autoComplete }: { label: string; id: string; value: string; onChange: (value: string) => void; type?: string; autoComplete?: string }) { return <div className="space-y-1"><label htmlFor={id}>{label}</label><Input id={id} type={type} value={value} required autoComplete={autoComplete} onChange={(e) => onChange(e.target.value)} /></div> }

export function TermsPage() { return <PublicShell><main className="mx-auto w-full max-w-2xl flex-1 space-y-4 px-5 py-10"><h1 className="text-[22px] font-semibold">Điều khoản sử dụng</h1><p className="text-sm text-muted-foreground">Bản nháp, đang chờ hoàn thiện.</p><p>Flowy là sản phẩm dự thi, hỗ trợ hộ kinh doanh theo dõi hoạt động cửa hàng.</p><p>Dữ liệu bạn cung cấp được dùng để vận hành ứng dụng; nhóm không bán dữ liệu này.</p><p>AI có thể đưa ra thông tin chưa chính xác. Chủ hộ cần kiểm tra và chịu trách nhiệm về quyết định cuối cùng.</p><p>Liên hệ nhóm phát triển Flowy để được hỗ trợ.</p></main></PublicShell> }
