# Component Flowy

Import từ `@/components/flowy`. Ví dụ đầy đủ nằm ở `client/src/pages/DesignSystemPage.tsx` (route `/design-system`).

## Bố cục

```tsx
<AppShell
  shopName="Lan Closet"
  hubPending={2}
  threads={threads}          // ThreadItem[]
  features={features}        // { id, label, icon }[]
  activeId={active}          // "hub" | id luồng | id trang chức năng
  onNavigate={setActive}
  topbar={<b className="font-semibold">Chat trung tâm</b>}
>
  <ChatFeed>{/* tin nhắn */}</ChatFeed>
  <ChatFooter><Composer onSubmit={...} /></ChatFooter>
</AppShell>
```

- `AppShell`: sidebar 232px (Chat trung tâm, Luồng việc, Chức năng) và vùng chính. Mở app luôn vào `activeId="hub"`.
- `ChatFeed`, `ChatFooter`: vùng cuộn và đáy khung chat. Cột chat tối đa 680px.
- `ThreadBreadcrumb`, `ThreadScope`: đường dẫn "Chat trung tâm / tên luồng" ở thanh trên và dòng phạm vi đầu luồng.

## Chat

| Component | Dùng khi |
|---|---|
| `AssistantMessage` | Tin của AI. Con là chữ ngắn rồi các khối. `live` khi AI đang trả lời. |
| `AssistantText` | Văn bản AI với đoạn, xuống dòng, danh sách đầu dòng và chữ đậm; HTML được hiển thị như văn bản. |
| `UserMessage` | Tin của người dùng, có thể kèm `files`. |
| `Composer` | Ô chat. `onSubmit(text, files)`, tối đa 3 `suggestions`; chọn một tệp sao kê CSV hoặc XLSX. |
| `DayDivider` | Dải ngày giữa feed. |

## Luồng việc

| Component | Dùng khi |
|---|---|
| `ThreadList` | Danh sách luồng trong sidebar. Trạng thái `alert`, `waiting`, `running`, `done`; tự sắp theo mức cần chú ý. |
| `ThreadSummary` | AI báo vào chat trung tâm khi luồng chờ duyệt hoặc xong. Một luồng một thẻ. Không có nút Duyệt ở đây. |
| `ProactiveNotice` | Tin ở đầu chat trung tâm khi có việc cần chú ý. Có nút mở trang hoặc luồng, và nút bỏ qua. Có thể ghép `ResultCard` trong phần nội dung để hiện số liệu và nguồn. |
| `ThreadStatusIcon`, `StateLabel` | Ký hiệu 10px và nhãn trạng thái viết hoa. |

## Khối AI

| Component | Dùng khi |
|---|---|
| `AgentStep` | Một lần AI làm việc trong luồng: các bước, câu hỏi lại (`questions`), Duyệt, Hoàn tác. `state`: `working`, `waiting`, `done`, `undone`, `failed`. |
| `ResultCard` | Số liệu từ máy chủ, tối đa 3 ô, có nguồn và `how` (Cách tính); `unit: 'count'` cho số lượng, mặc định hiển thị tiền. |
| `DataTable` | Bảng dữ liệu do máy chủ trả về, hiển thị số tiền với `Money`, số lượng riêng, nguồn và cách tính. |
| `RiskAlert` | Cảnh báo lừa đảo mức `mid` hoặc `high`, danh sách lý do, một hành động an toàn. |
| `Block*` | Khung chung để tự dựng khối AI mới. |

## Nhỏ

- `Money`: `<Money value={8420000} />`, `size="lg"` cho số chính. Số âm hiện "−".
- `BarChart`: `<BarChart points={[{ label: '26/11', value: 250000 }]} />` cho chuỗi tiền do nguồn dữ liệu cung cấp; luôn kèm bảng số liệu và nguồn ở màn hình sử dụng.
- `RiskBadge level="low|mid|high"` và `OrderStatusBadge status="pending|approved|cancelled|new"`.
- `toastDone('Đã ghi 14 giao dịch vào sổ.', onUndo)`: thông báo sau khi ghi dữ liệu, có Hoàn tác 10 giây. Đặt `<Toaster />` (đã có trong `App.tsx`).
- `Button` shadcn: `default` cho hành động chính (một nút mỗi khối), `outline` cho phụ, `ghost` cho thanh công cụ, `destructive` cho xóa. Nút trong khối AI dùng `size="lg"`.
- `AgentStep` có thể nhận `onSkip` để bỏ qua đề xuất mà không thay đổi dữ liệu; `extra` để ghép ô nhập chuyên biệt và `canUndo={false}` cho tin nhắn đã gửi không thể hoàn tác.
- `Badge` shadcn có thêm biến thể `risk-low`, `risk-mid`, `risk-high`.

## Quy tắc ghép màn hình mới

- Màn hình AI (chat, luồng): dùng `AppShell` + `ChatFeed` + `Composer`.
- Trang chức năng (Sổ thu chi, Đơn hàng...): thay chỗ khung chat, tiêu đề `h1` 22px, bảng bằng `Table` shadcn (viền `border`, số tiền căn phải dùng `Money`), và nút "Hỏi AI về trang này" trên thanh trên.
- Mọi dữ liệu thật đi qua `src/lib/api.ts`. Trang `/design-system` dùng dữ liệu mẫu và có thể xóa trước khi triển khai.
