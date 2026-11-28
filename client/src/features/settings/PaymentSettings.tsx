import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { paymentConfigApi, type PaymentConfig } from '@/lib/payments/config'

/**
 * Cấu hình thanh toán của chính cửa hàng (mô hình nhiều shop).
 * Shop tự tạo webhook trên SePay với secret của mình, dán secret vào đây, rồi dán
 * đường dẫn webhook trả về vào SePay.
 *
 * Server không bao giờ trả lại secret dạng plaintext: chỉ hiện 4 ký tự cuối.
 */
export function PaymentSettings() {
  const [config, setConfig] = useState<PaymentConfig | null>(null)
  const [secret, setSecret] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  function load() {
    setError('')
    paymentConfigApi
      .get()
      .then((result) => setConfig(result.payment))
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'Không tải được cấu hình thanh toán.'),
      )
  }

  useEffect(() => {
    let active = true
    paymentConfigApi
      .get()
      .then((result) => {
        if (active) setConfig(result.payment)
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : 'Không tải được cấu hình thanh toán.')
      })
    return () => {
      active = false
    }
  }, [])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!secret.trim()) {
      setError('Dán secret key của webhook SePay trước khi lưu.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const result = await paymentConfigApi.set({ secret: secret.trim(), provider: 'sepay' })
      setConfig(result.payment)
      setSecret('')
      toast.success('Đã lưu secret thanh toán.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không lưu được secret.')
    } finally {
      setBusy(false)
    }
  }

  async function clear() {
    setBusy(true)
    setError('')
    try {
      const result = await paymentConfigApi.clear()
      setConfig(result.payment)
      toast.success('Đã xoá secret. Cửa hàng tạm thời không nhận được webhook thanh toán.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không xoá được secret.')
    } finally {
      setBusy(false)
    }
  }

  function copy(text: string) {
    navigator.clipboard?.writeText(text).then(
      () => toast.success('Đã sao chép.'),
      () => toast.error('Không sao chép được. Bạn chọn và copy tay nhé.'),
    )
  }

  if (error && !config) {
    return (
      <div role="alert" className="flex items-center gap-2 text-sm text-risk-high">
        {error}
        <Button variant="outline" size="sm" onClick={load}>
          Thử lại
        </Button>
      </div>
    )
  }

  if (!config) return <p className="text-sm text-muted-foreground">Đang tải cấu hình thanh toán…</p>

  return (
    <div className="flex max-w-xl flex-col gap-5">
      <section className="flex flex-col gap-3 border border-border p-3">
        <h2 className="m-0 text-[14px] font-semibold">Trạng thái xác thực webhook</h2>
        <p className="m-0 text-sm">
          {config.hasSecret ? (
            <>
              Đã cấu hình. Secret đang lưu: <span className="tabular-nums">{config.secretMask}</span>
            </>
          ) : (
            <span className="text-risk-mid">Chưa cấu hình. Cửa hàng chưa nhận được thanh toán tự động.</span>
          )}
        </p>

        <div className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Đường dẫn webhook dán vào SePay
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <code className="border border-border px-2 py-1 text-xs">{config.webhookPath}</code>
            <Button variant="outline" size="sm" onClick={() => copy(config.webhookPath)}>
              Sao chép đường dẫn
            </Button>
          </div>
          <p className="m-0 text-xs text-muted-foreground">
            Trên SePay, tạo webhook với URL đầy đủ là <code>https://&lt;tên-miền-máy-chủ&gt;{config.webhookPath}</code>{' '}
            và chọn xác thực HMAC-SHA256.
          </p>
        </div>

        {!config.encryptionConfigured && (
          <p className="m-0 border border-dashed border-risk-high bg-risk-high-soft px-3 py-2 text-xs text-risk-high">
            Máy chủ chưa có APP_ENCRYPTION_KEY nên chưa lưu được secret. Báo người quản trị máy chủ.
          </p>
        )}
      </section>

      <form className="flex flex-col gap-3" onSubmit={submit}>
        <label className="flex flex-col gap-2 text-sm">
          Secret key của webhook SePay
          <Input
            type="password"
            autoComplete="off"
            placeholder="Dán secret SePay cấp khi tạo webhook"
            value={secret}
            onChange={(event) => setSecret(event.target.value)}
          />
        </label>
        <p className="m-0 text-xs text-muted-foreground">
          Secret được mã hoá trước khi lưu và không hiển thị lại. Nếu quên, tạo secret mới trên SePay
          rồi dán lại vào đây.
        </p>
        {error && (
          <p role="alert" className="m-0 text-sm text-risk-high">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={busy}>
            Lưu secret
          </Button>
          {config.hasSecret && (
            <Button type="button" variant="outline" disabled={busy} onClick={clear}>
              Xoá secret
            </Button>
          )}
        </div>
      </form>

      <section className="flex flex-col gap-2 border border-border p-3">
        <h2 className="m-0 text-[14px] font-semibold">Tài khoản nhận tiền</h2>
        <p className="m-0 text-sm">
          Số tài khoản: <span className="tabular-nums">{config.bankAccountNumber ?? 'chưa đặt'}</span>
        </p>
        <p className="m-0 text-xs text-muted-foreground">
          Số tài khoản và mã ngân hàng dùng để tạo mã VietQR cho khách. Sửa ở tab thông tin cửa hàng.
        </p>
      </section>
    </div>
  )
}
