import { useState } from 'react'
import { History, Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  AgentStep,
  AppShell,
  BarChart,
  AssistantMessage,
  AssistantText,
  ChatFeed,
  ChatFooter,
  Composer,
  DayDivider,
  Money,
  OrderStatusBadge,
  ProactiveNotice,
  ResultCard,
  DataTable,
  RiskAlert,
  RiskBadge,
  StateLabel,
  ThreadBreadcrumb,
  ThreadScope,
  ThreadSummary,
  UserMessage,
  toastDone,
} from '@/components/flowy'
import { FEATURES, THREADS } from './design-system/sample'

/**
 * Trang demo design system: /design-system
 * Dựng lại đúng bố cục đã chốt (chat trung tâm + luồng việc) bằng các component trong @/components/flowy.
 * Dùng làm mẫu khi dựng màn hình thật.
 */
export default function DesignSystemPage() {
  const [active, setActive] = useState('hub')
  const thread = THREADS.find((t) => t.id === active)
  const feature = FEATURES.find((f) => f.id === active)

  return (
    <AppShell
      shopName="Lan Closet"
      hubPending={2}
      threads={THREADS}
      features={FEATURES}
      activeId={active}
      onNavigate={setActive}
      topbar={
        <>
          {thread ? (
            <ThreadBreadcrumb title={thread.title} onBack={() => setActive('hub')} />
          ) : (
            <b className="font-semibold">{feature ? feature.label : 'Chat trung tâm'}</b>
          )}
          <span className="flex-1" />
          {thread?.id === 't-ledger' && <StateLabel>Chờ bạn duyệt</StateLabel>}
          {!thread && !feature && (
            <Button variant="outline">
              <History />
              Lịch sử thao tác
            </Button>
          )}
          <ThemeToggle />
        </>
      }
    >
      {active === 'hub' && <HubChat open={setActive} />}
      {active === 't-ledger' && <LedgerThread />}
      {active === 't-1042' && <FraudThread />}
      {(active === 't-week' || active === 't-remind') && <SimpleThread title={thread!.title} />}
      {feature && <FeaturePlaceholder label={feature.label} onAsk={() => setActive('hub')} />}
    </AppShell>
  )
}

function HubChat({ open }: { open: (id: string) => void }) {
  return (
    <>
      <ChatFeed>
        <DayDivider>Hôm nay, 26/11</DayDivider>
        <AssistantMessage><DataTable columns={[{ key: 'name', label: 'Chức năng', kind: 'text' }]} rows={FEATURES.map((item) => [item.label])} source="ví dụ" updatedAt="—" how="Danh sách chức năng." /></AssistantMessage>
        <AssistantMessage>
          <ThreadSummary
            title="Nhắc 3 khách nhận hàng"
            status="done"
            updatedAt="20:05"
            summary="Đã nhắn 3 khách qua Messenger. 2 khách xác nhận đã nhận, đơn #1031 và #1035 chuyển sang Đã giao. Khách đơn #1038 chưa trả lời."
            onOpen={() => open('t-remind')}
          />
        </AssistantMessage>
        <AssistantMessage>
          <ProactiveNotice
            risk="high"
            headline="Đơn #1042 có dấu hiệu lừa đảo."
            detail="Khách gửi ảnh bill 1.200.000 ₫ nhưng ngân hàng chưa báo tiền vào, và số tài khoản trong ảnh không phải của cửa hàng. Mình đã giữ đơn lại và mở luồng kiểm tra."
            actionLabel="Mở luồng kiểm tra"
            onOpenThread={() => open('t-1042')}
            onDismiss={() => {}}
          />
        </AssistantMessage>
        <AssistantMessage>
          <ThreadSummary
            title="Ghi sổ sao kê 26/11"
            status="waiting"
            updatedAt="21:40"
            summary="Đã đọc 14 giao dịch, khớp 9 giao dịch với đơn. Còn 2 dòng cần bạn chọn loại trước khi ghi sổ."
            onOpen={() => open('t-ledger')}
          />
        </AssistantMessage>
        <UserMessage>Lãi tuần này bao nhiêu?</UserMessage>
        <AssistantMessage>
          <AssistantText text={'Mình đã kiểm tra:\n- **Sổ thu chi** đã sẵn sàng\n- Bạn có thể gửi yêu cầu tiếp theo'} />
          <p>Mình đang làm báo cáo tuần 47 trong một luồng riêng, xong sẽ báo lại ở đây. Số tạm tính đến 21:42:</p>
          <ResultCard
            source="sổ thu chi"
            updatedAt="21:42"
            metrics={[
              { label: 'Doanh thu tuần', value: 41_300_000, delta: '▲ 8% so với tuần 46', tone: 'good' },
              { label: 'Chi phí', value: 29_850_000, delta: '▲ 14% do nhập hàng', tone: 'bad' },
              { label: 'Lãi tạm tính', value: 11_450_000, delta: 'chưa gồm 2 dòng chờ duyệt' },
            ]}
            how={[
              { label: 'Doanh thu (86 đơn đã duyệt)', value: 41_300_000 },
              { label: 'Nhập hàng', value: -24_600_000 },
              { label: 'Phí ship và khác', value: -5_250_000 },
              { label: 'Lãi tạm tính', value: 11_450_000, total: true },
            ]}
          />
          <p>Ví dụ biểu đồ doanh thu (dữ liệu mẫu):</p>
          <BarChart points={[{ label: '25/11', value: 250000 }, { label: '26/11', value: 400000 }]} />
          <Table><TableHeader><TableRow><TableHead>Ngày</TableHead><TableHead>Doanh thu</TableHead></TableRow></TableHeader><TableBody><TableRow><TableCell>25/11</TableCell><TableCell><Money value={250000} /></TableCell></TableRow><TableRow><TableCell>26/11</TableCell><TableCell><Money value={400000} /></TableCell></TableRow></TableBody></Table>
          <p className="text-xs text-muted-foreground">Nguồn: dữ liệu mẫu.</p>
        </AssistantMessage>
        <AssistantMessage live />
      </ChatFeed>
      <ChatFooter>
        <Composer
          suggestions={['Lãi tuần này?', 'Đơn nào chưa thanh toán?', 'Nhập sao kê']}
          onSubmit={() => {}}
        />
      </ChatFooter>
    </>
  )
}

function LedgerThread() {
  const [answers, setAnswers] = useState<Record<string, string>>({ a: 'Nhập hàng', b: 'Phí ship' })
  const [state, setState] = useState<'waiting' | 'done' | 'undone'>('waiting')
  return (
    <>
      <ChatFeed>
        <ThreadScope>
          Luồng này chỉ ghi sổ sao kê VCB ngày 26/11. Xong việc, kết quả sẽ được tóm tắt về chat trung tâm.
        </ThreadScope>
        <UserMessage files={['saoke_VCB_26-11.xlsx']}>Nhập giúp mình sao kê hôm nay nhé.</UserMessage>
        <AssistantMessage>
          <p>Mình đã đọc file. 12 dòng phân loại được, còn 2 dòng cần bạn chọn.</p>
          <AgentStep
            title="Ghi 14 giao dịch vào sổ"
            state={state}
            steps={[
              { label: 'Đọc sao kê VCB', meta: '14 dòng, từ 00:00 đến 21:40', status: 'done' },
              {
                label: 'Khớp 9 giao dịch với đơn trên Messenger',
                meta: '9 đơn chuyển sang Đã duyệt sau khi ghi sổ',
                status: 'done',
              },
              { label: 'Phân loại 2 dòng chưa rõ', status: 'needs' },
            ]}
            questions={[
              { id: 'a', label: '−350.000 ₫ · "CK NGUYEN VAN B"', options: ['Nhập hàng', 'Phí ship', 'Khác'], value: answers.a },
              { id: 'b', label: '−120.000 ₫ · "GRAB*A2F"', options: ['Nhập hàng', 'Phí ship', 'Khác'], value: answers.b },
            ]}
            onAnswer={(id, o) => setAnswers({ ...answers, [id]: o })}
            approveLabel="Duyệt và ghi sổ"
            onApprove={() => {
              setState('done')
              toastDone('Đã ghi 14 giao dịch vào sổ.', () => setState('undone'))
            }}
            onEdit={() => {}}
            doneText="Đã ghi 14 giao dịch lúc 21:42"
            onUndo={() => setState('undone')}
            undoNote="Hoàn tác sẽ xóa 14 dòng vừa ghi và trả 9 đơn về Chờ thanh toán"
          />
        </AssistantMessage>
      </ChatFeed>
      <ChatFooter>
        <Composer placeholder="Nhắn trong luồng này..." onSubmit={() => {}} />
      </ChatFooter>
    </>
  )
}

function FraudThread() {
  return (
    <>
      <ChatFeed>
        <ThreadScope>Luồng này chỉ kiểm tra đơn #1042. Đơn đang được giữ, chưa giao.</ThreadScope>
        <AssistantMessage>
          <RiskAlert
            title="Đơn #1042 có dấu hiệu lừa đảo"
            level="high"
            reasons={[
              'Khách gửi ảnh bill 1.200.000 ₫ nhưng ngân hàng chưa báo tiền vào.',
              'Số tài khoản trong ảnh không phải của cửa hàng.',
            ]}
            safeActionLabel="Giữ đơn, chưa giao"
            onSafeAction={() => {}}
            onView={() => {}}
            detectedNote="Phát hiện lúc 21:15 từ tin nhắn Messenger"
          />
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Trạng thái đơn:</span>
            <OrderStatusBadge status="pending" />
            <RiskBadge level="low" />
            <RiskBadge level="mid" />
            <RiskBadge level="high" />
          </div>
        </AssistantMessage>
      </ChatFeed>
      <ChatFooter>
        <Composer placeholder="Nhắn trong luồng này..." onSubmit={() => {}} />
      </ChatFooter>
    </>
  )
}

function SimpleThread({ title }: { title: string }) {
  return (
    <>
      <ChatFeed>
        <ThreadScope>Luồng này chỉ làm: {title}.</ThreadScope>
        <AssistantMessage live />
      </ChatFeed>
      <ChatFooter>
        <Composer placeholder="Nhắn trong luồng này..." onSubmit={() => {}} />
      </ChatFooter>
    </>
  )
}

function FeaturePlaceholder({ label, onAsk }: { label: string; onAsk: () => void }) {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-5 py-8">
      <h1 className="m-0 text-[22px] leading-7 font-semibold tracking-tight">{label}</h1>
      <p className="m-0 text-muted-foreground">
        Trang chức năng thay chỗ khung chat. Người dùng xem và chỉnh tay ở đây; muốn nhờ AI thì quay lại chat.
      </p>
      <div>
        <Button variant="outline" onClick={onAsk}>
          Hỏi AI về trang này
        </Button>
      </div>
    </div>
  )
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const dark = resolvedTheme === 'dark'
  return (
    <Button variant="ghost" size="icon" aria-label="Đổi giao diện sáng/tối" onClick={() => setTheme(dark ? 'light' : 'dark')}>
      {dark ? <Sun /> : <Moon />}
    </Button>
  )
}
