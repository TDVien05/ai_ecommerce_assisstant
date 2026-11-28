import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TransactionsPanel } from '@/features/transactions/TransactionsPanel'
import { OrdersPage } from '@/features/orders/OrdersPage'
import { LedgerPanel } from '@/features/ledger/LedgerPanel'
import { ReportsPage } from '@/features/reports/ReportsPage'
import { AlertsPage } from '@/features/alerts/AlertsPage'
import { TemplatesPage } from '@/features/ledgerTemplates/TemplatesPage'
import { ThresholdCard } from '@/features/ledgerTemplates/ThresholdCard'
import { MessengerPage } from '@/features/messenger/MessengerPage'
import { SourcesPage } from '@/features/sources/SourcesPage'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { PaymentSettings } from '@/features/settings/PaymentSettings'
import { isReal } from '@/lib/realApi'

/** Trang chức năng. "Sổ thu chi" có danh sách giao dịch; phần còn lại chưa nối dữ liệu. */
export function FeaturePage({ id, title, about, allowMock }: { id: string; title: string; about: string; allowMock: boolean }) {
  const realBooks = isReal('finance') || isReal('assistant')
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-5 py-8">
        <h1 className="m-0 text-[22px] leading-7 font-semibold tracking-tight">{title}</h1>
        {!allowMock && !(isReal('finance') && (id === 'ledger' || id === 'reports')) && !(realBooks && id === 'ledger') && !(isReal('orders') && id === 'orders') && !(isReal('alerts') && id === 'fraud') && !(isReal('shop') && id === 'settings') ? <Empty about={about} /> : id === 'ledger' ? (
          <>
          {allowMock && !isReal('finance') && <><p className="text-sm text-muted-foreground">Dữ liệu mẫu.</p><ThresholdCard /></>}
          <Tabs defaultValue={new URLSearchParams(window.location.search).get('tab') === 'templates' || (!allowMock && !isReal('finance')) ? 'templates' : isReal('finance') ? 'entries' : 'payments'} className="gap-4">
            <TabsList variant="line">
              {allowMock && <TabsTrigger value="payments">Giao dịch ngân hàng</TabsTrigger>}
              {(allowMock || isReal('finance')) && <TabsTrigger value="entries">Thu chi</TabsTrigger>}
              {(allowMock || realBooks) && <TabsTrigger value="templates">Mẫu sổ</TabsTrigger>}
            </TabsList>
            <TabsContent value="payments">
              <p className="text-sm text-muted-foreground">Dữ liệu mẫu.</p><TransactionsPanel />
            </TabsContent>
            <TabsContent value="entries">
              <LedgerPanel />
            </TabsContent>
            <TabsContent value="templates">{!realBooks && <p className="text-sm text-muted-foreground">Dữ liệu mẫu.</p>}<TemplatesPage /></TabsContent>
          </Tabs>
          </>
        ) : id === 'orders' ? (
          <>{!isReal('orders') && <p className="text-sm text-muted-foreground">Dữ liệu mẫu.</p>}<OrdersPage /></>
        ) : id === 'reports' ? (
          <ReportsPage />
        ) : id === 'fraud' ? (
          <>{!isReal('alerts') && <p className="text-sm text-muted-foreground">Dữ liệu mẫu.</p>}<AlertsPage /></>
        ) : id === 'messenger' ? (
          <><p className="text-sm text-muted-foreground">Dữ liệu mẫu.</p><MessengerPage /></>
        ) : id === 'sources' ? (
          <><p className="text-sm text-muted-foreground">Dữ liệu mẫu.</p><SourcesPage /></>
        ) : id === 'settings' ? (
          <Tabs defaultValue="shop" className="gap-4">
            <TabsList variant="line">
              <TabsTrigger value="shop">Cửa hàng</TabsTrigger>
              <TabsTrigger value="payment">Thanh toán</TabsTrigger>
            </TabsList>
            <TabsContent value="shop">
              {!isReal('shop') && <p className="text-sm text-muted-foreground">Dữ liệu mẫu.</p>}
              <SettingsPage />
            </TabsContent>
            <TabsContent value="payment">
              <PaymentSettings />
            </TabsContent>
          </Tabs>
        ) : (
          <Empty about={about} />
        )}
      </div>
    </div>
  )
}

function Empty({ about }: { about: string }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-muted-foreground">{about}</p>
      <div className="border border-dashed px-3 py-6 text-center text-muted-foreground">Trang này chưa nối dữ liệu.</div>
    </div>
  )
}
