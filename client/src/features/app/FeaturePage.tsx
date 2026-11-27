import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TransactionsPanel } from '@/features/transactions/TransactionsPanel'
import { OrdersPage } from '@/features/orders/OrdersPage'
import { LedgerPanel } from '@/features/ledger/LedgerPanel'
import { ReportsPage } from '@/features/reports/ReportsPage'
import { AlertsPage } from '@/features/alerts/AlertsPage'
import { TemplatesPage } from '@/features/ledgerTemplates/TemplatesPage'
import { ThresholdCard } from '@/features/ledgerTemplates/ThresholdCard'

/** Trang chức năng. "Sổ thu chi" có danh sách giao dịch; phần còn lại chưa nối dữ liệu. */
export function FeaturePage({ id, title, about }: { id: string; title: string; about: string }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-5 py-8">
        <h1 className="m-0 text-[22px] leading-7 font-semibold tracking-tight">{title}</h1>
        {id === 'ledger' ? (
          <>
          <ThresholdCard />
          <Tabs defaultValue="payments" className="gap-4">
            <TabsList variant="line">
              <TabsTrigger value="payments">Giao dịch ngân hàng</TabsTrigger>
              <TabsTrigger value="entries">Thu chi</TabsTrigger>
              <TabsTrigger value="templates">Mẫu sổ</TabsTrigger>
            </TabsList>
            <TabsContent value="payments">
              <TransactionsPanel />
            </TabsContent>
            <TabsContent value="entries">
              <LedgerPanel />
            </TabsContent>
            <TabsContent value="templates"><TemplatesPage /></TabsContent>
          </Tabs>
          </>
        ) : id === 'orders' ? (
          <OrdersPage />
        ) : id === 'reports' ? (
          <ReportsPage />
        ) : id === 'fraud' ? (
          <AlertsPage />
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
