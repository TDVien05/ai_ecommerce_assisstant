# Flowy Design System

Nguồn sự thật cho giao diện của dự án. Mọi màn hình mới (do người hoặc do agent AI làm) phải dựng từ tài liệu này, theme trong `client/src/index.css` và các component trong `client/src/components/flowy/`.

- Xem trực tiếp: chạy `npm run dev` rồi mở `/design-system`.
- Agent AI: đọc [AGENTS.md](./AGENTS.md) trước.
- Cách dùng từng component: [COMPONENTS.md](./COMPONENTS.md).

Flowy là tên sản phẩm và cũng là tên trợ lý AI: trợ lý dòng tiền cho hộ kinh doanh online. AI làm việc như một thư ký: nhận việc qua chat, tự chạy từng việc trong một luồng riêng, chủ động báo khi có chuyện, và chỉ thay đổi dữ liệu sau khi chủ shop duyệt. Giao diện trắng đen, vuông góc, ít chi tiết, để người bán hàng nhỏ dùng được ngay mà không cần học.

Mọi giao diện mới của dự án phải dựa trên tài liệu này. Khi cần thứ chưa có ở đây, ghép từ token và component sẵn có trước, rồi đề xuất bổ sung vào hệ thống.

## Nguyên tắc

1. **Chat là màn hình chính.** Mở app luôn vào Chat trung tâm. Trang chức năng chỉ là nơi xem và chỉnh tay, không phải điểm bắt đầu.
2. **AI làm, bạn duyệt.** Mọi thay đổi dữ liệu do AI đề xuất đi qua khối AgentStep có nút Duyệt, và luôn hoàn tác được.
3. **Một luồng, một việc.** Mỗi việc cụ thể chạy trong một luồng riêng. Chat trung tâm chỉ nhận tóm tắt kết quả (ThreadSummary) và tin chủ động (ProactiveNotice).
4. **Số có nguồn.** Mọi con số kèm dòng nguồn và link "Cách tính". AI không tự tính tiền, không tự xác nhận thanh toán.
5. **Màu là tín hiệu.** Giao diện trắng đen; màu chỉ dùng cho mức rủi ro, trạng thái đơn và tiền tăng giảm. Thấy màu là có điều cần chú ý.

## Bố cục

- Sidebar trái 232px (AppShell): Chat trung tâm ở trên cùng, rồi danh sách Luồng việc (ThreadList), rồi các trang Chức năng (Sổ thu chi, Đơn hàng, Báo cáo, Cảnh báo lừa đảo, Bot Messenger, Nguồn dữ liệu), chân là Cài đặt cửa hàng.
- Vùng chính: thanh trên 44px, feed chat cột tối đa 680px căn giữa, Composer ở đáy.
- Trong một luồng, thanh trên ghi đường dẫn "Chat trung tâm / <tên luồng>" và nhãn trạng thái; dưới thanh trên là dòng phạm vi viền nét đứt nói luồng này làm đúng việc gì.
- Bấm một trang chức năng thì trang đó thay chỗ khung chat; thanh trên có nút "Hỏi AI về trang này".
- Màn hình dưới 860px: sidebar thành dải ngang. Điện thoại chưa phải ưu tiên của bản dự thi.

## Màu

- Nền `background`, chữ `foreground`, chữ phụ `muted-foreground`, viền `border`. Nút chính và mục đang chọn dùng `primary` (đen ở theme sáng, trắng ở theme tối) với chữ `primary-foreground`.
- Vùng phụ (khung AI hỏi lại, khung Cách tính, tin nhắn người dùng) dùng `muted` hoặc `secondary`.
- Rủi ro: `risk-low`, `risk-mid`, `risk-high` làm chữ, kèm nền `-soft` tương ứng cho huy hiệu. `success` và `warning` là bí danh của `risk-low` và `risk-mid`. `destructive` là bí danh của `risk-high`.
- Biểu đồ chỉ dùng thang xám `chart-1` đến `chart-5`. Muốn nhấn một điểm thì dùng `chart-1`, không thêm màu.
- Không thêm màu thương hiệu, không dùng gradient. Không dùng màu hồng của MoMo.
- Mọi cặp chữ và nền đạt tối thiểu 4.5:1 ở cả hai theme; viền ô nhập `input` đạt 3:1.

## Chữ

- Một họ chữ: Geist (có đủ dấu tiếng Việt), qua `@fontsource-variable/geist` đã cài trong repo.
- Thang chữ: `display` 28 (lời chào), `h1` 22 (tiêu đề trang), `h2` 16, `h3` 14 đậm (tiêu đề khối), `body` 14 (mặc định), `body-lg` 16 (ô chat), `caption` 12 (nguồn, giờ), `overline` 11 viết hoa (nhãn nhóm, nhãn trạng thái).
- Số tiền: `money-lg` 22 đậm trong thẻ kết quả, `money` 14 trong bảng; luôn `tabular-nums`, không xuống dòng, căn phải trong bảng.
- Tiền định dạng bằng `Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })`: "8.420.000 ₫". Số âm dùng ký tự "−". Ngày "26/11", giờ "21:42" (24 giờ).

## Hình khối

- Bo góc chỉ có hai mức: `radius-none` (0px) cho khung app, sidebar, thẻ, khối AI, bảng, dialog; `radius-xs` (2px) cho nút, ô nhập, ô chat, chip, huy hiệu, mục sidebar.
- Tách khối bằng viền 1px `border`, không bằng bóng. Chỉ lớp nổi (dropdown, popover, dialog, toast) có `shadow-overlay`.
- Khối cần chú ý dùng viền đậm `foreground`: AgentStep chờ duyệt, ThreadSummary chờ duyệt, ProactiveNotice. Khối cảnh báo mức Cao dùng viền `risk-high`.
- Khoảng cách theo lưới 4px: `space-2` giữa các nút, `space-3` trong khối nhỏ, `space-4` padding thẻ và giữa tin nhắn, `space-5` lề khung chat, `space-6` giữa các nhóm.
- Không dùng thẻ có vạch màu bên trái, không dùng emoji trang trí.

## Biểu tượng

- Dùng lucide-react (đã có trong repo), cỡ 16px, nét 1.75. Icon đứng trước chữ, không dùng icon thay chữ trừ nút đính kèm, gửi, đóng (có `aria-label`).
- Trạng thái luồng dùng ô vuông 10px (ThreadList); bước AI dùng ô vuông 16px (AgentStep). Hình vuông là ngôn ngữ hình chung của hệ thống.
- Nhãn AI là ô vuông 24px nền `primary` chữ "AI". Không dùng mascot, avatar robot hay biểu tượng lấp lánh.

## Giọng văn

- AI (tên Flowy) xưng "mình", gọi người dùng là "bạn". Nhãn AI trên tin nhắn vẫn là chữ "AI"; chữ "F" chỉ dùng cho logo tạm của sản phẩm ở sidebar. Câu ngắn, nói việc đã làm và việc cần bạn làm.
  - Đúng: "Mình đã đọc 14 dòng, còn 2 dòng cần bạn chọn loại."
  - Sai: "Quá trình xử lý đã hoàn tất thành công!"
- Nút là động từ cụ thể: "Duyệt và ghi sổ", "Giữ đơn, chưa giao", "Vào duyệt". Không dùng "OK", "Xác nhận" trơn.
- Thông báo ở thì quá khứ, có số: "Đã ghi 14 giao dịch vào sổ." Lỗi nói lỗi gì và cách sửa.
- Cảnh báo nêu bằng chứng, không dọa: "Số tài khoản trong ảnh không phải của cửa hàng."
- Viết hoa chữ đầu câu, không viết hoa mỗi từ. Không emoji, không dấu chấm than.
- Tài liệu chính thức (SRS, hướng dẫn nộp thi) giữ văn phong trang trọng; giọng thân mật chỉ dùng trong giao diện.

## Trạng thái và chuyển động

- Focus bàn phím: viền 2px `ring` liền, cách 2px. Không bỏ outline.
- Hover: nền `accent`. Tắt: mờ 45%.
- Chuyển động ngắn (150 ms), chỉ ở chỗ báo AI đang làm: nhãn AI nhấp nháy, vòng xoay ở luồng đang chạy, ba chấm khi AI đang trả lời. Tắt hết khi người dùng bật giảm chuyển động.

## Quyết định mặc định (chờ xác nhận)

- Nhãn AI là ô vuông đen chữ "AI", chưa dùng logo.
- Điện thoại chưa phải ưu tiên; chỉ đảm bảo không vỡ bố cục dưới 860px.
- Trang chức năng thay chỗ khung chat, không hiển thị song song.

## Component

Bố cục: AppShell. Chat: ChatMessage, Composer. Luồng việc: ThreadList, ThreadSummary, ProactiveNotice. Khối AI: AgentStep, ResultCard. Rủi ro: RiskBadge, RiskAlert. Thao tác: Button, UndoToast. Mỗi component có trang hướng dẫn riêng nói khi nào dùng và cần truyền gì.

Cách cài theme vào repo nằm ở mục "Cài vào repo".


## Bảng token màu

Tên biến trùng tên shadcn nên component shadcn có sẵn tự đổi theo. Dùng qua Tailwind (`bg-background`, `text-muted-foreground`, `border-border`, `text-risk-high`...), không viết mã màu trực tiếp.

| Token | Sáng | Tối | Dùng cho |
|---|---|---|---|
| `background` | `#ffffff` | `#0a0a0a` | Nền trang, khung chat, thẻ. Toàn hệ thống dùng nền phẳng một màu. |
| `foreground` | `#0a0a0a` | `#f5f5f5` | Chữ chính. Đọc được trên background, card, popover, muted, sidebar (≥15:1). |
| `card` | `{background}` | `{background}` | Nền thẻ: khối bước AI, thẻ kết quả. Cùng màu nền trang, tách bằng viền border. |
| `card-foreground` | `{foreground}` | `{foreground}` | Chữ trên card. |
| `popover` | `#ffffff` | `#141414` | Menu, dropdown, tooltip, dialog, toast. |
| `popover-foreground` | `{foreground}` | `{foreground}` | Chữ trên popover. |
| `primary` | `#0a0a0a` | `#f5f5f5` | Nút chính (Duyệt, Gửi), mục sidebar đang chọn, nhãn AI. Ở dark mode đảo thành trắng. |
| `primary-foreground` | `#ffffff` | `#0a0a0a` | Chữ và icon trên nền primary. |
| `secondary` | `#f4f4f4` | `#171717` | Nút phụ có nền, tin nhắn của người dùng trong chat. |
| `secondary-foreground` | `{foreground}` | `{foreground}` | Chữ trên secondary. |
| `muted` | `#f4f4f4` | `#171717` | Vùng phụ: khung AI hỏi lại, khung Cách tính, tin nhắn người dùng. |
| `muted-foreground` | `#5c5c5c` | `#a3a3a3` | Chữ phụ: nguồn số liệu, giờ, nhãn KPI, placeholder. Đọc được trên background và muted (≥6:1). |
| `accent` | `#efefef` | `#1f1f1f` | Nền hover của nút ghost, mục sidebar, chip. |
| `accent-foreground` | `{foreground}` | `{foreground}` | Chữ trên accent. |
| `destructive` | `{risk-high}` | `{risk-high}` | Hành động phá hủy (xóa, hủy đơn) và lỗi nhập liệu. |
| `border` | `#e4e4e4` | `#262626` | Viền thẻ, đường kẻ bảng, đường chia vùng. Là cách chính để tách khối, thay cho đổ bóng. |
| `input` | `#8a8a8a` | `#737373` | Viền ô nhập, ô chat, checkbox. ≥3:1 trên background ở cả hai theme. |
| `ring` | `{foreground}` | `{foreground}` | Viền focus bàn phím: 2px liền, cách 2px. |
| `risk-low` | `#166534` | `#4ade80` | Rủi ro Thấp, trạng thái thành công (Đã duyệt, Đã ghi sổ), tiền tăng. Chữ trên background và risk-low-soft. |
| `risk-low-soft` | `#edf7ef` | `#0f2417` | Nền huy hiệu rủi ro Thấp. |
| `risk-mid` | `#8a4b00` | `#f5b544` | Rủi ro Trung bình, trạng thái chờ (Chờ thanh toán). Chữ trên background và risk-mid-soft. |
| `risk-mid-soft` | `#fbf3e4` | `#2a1f0a` | Nền huy hiệu rủi ro Trung bình. |
| `risk-high` | `#b42318` | `#f87171` | Rủi ro Cao, cảnh báo lừa đảo, lỗi, tiền giảm. Chữ trên background và risk-high-soft. |
| `risk-high-soft` | `#fdeeed` | `#2e1313` | Nền huy hiệu rủi ro Cao. |
| `success` | `{risk-low}` | `{risk-low}` | Bí danh của risk-low cho trạng thái thành công. |
| `warning` | `{risk-mid}` | `{risk-mid}` | Bí danh của risk-mid cho trạng thái chờ. |
| `chart-1` | `#0a0a0a` | `#f5f5f5` | Chuỗi chính trong biểu đồ. |
| `chart-2` | `#5c5c5c` | `#a3a3a3` | Chuỗi thứ hai (kỳ trước). |
| `chart-3` | `#8a8a8a` | `#737373` | Chuỗi thứ ba. |
| `chart-4` | `#b5b5b5` | `#525252` | Chuỗi thứ tư. |
| `chart-5` | `#d9d9d9` | `#333333` | Phần còn lại, nhóm Khác. |
| `sidebar` | `#fafafa` | `#0f0f0f` | Nền sidebar trái. |
| `sidebar-foreground` | `{foreground}` | `{foreground}` | Chữ trong sidebar. |
| `sidebar-primary` | `{primary}` | `{primary}` | Nền mục đang chọn trong sidebar (đảo màu). |
| `sidebar-primary-foreground` | `{primary-foreground}` | `{primary-foreground}` | Chữ mục đang chọn. |
| `sidebar-accent` | `{accent}` | `{accent}` | Hover trong sidebar. |
| `sidebar-accent-foreground` | `{accent-foreground}` | `{accent-foreground}` | Chữ khi hover trong sidebar. |
| `sidebar-border` | `{border}` | `{border}` | Viền phải của sidebar. |
| `sidebar-ring` | `{ring}` | `{ring}` | Focus trong sidebar. |

## Bo góc, khoảng cách, bóng

| Token | Giá trị | Dùng cho |
|---|---|---|
| `radius-none` | 0px | Khung app, sidebar, thẻ, khối bước AI, thẻ kết quả, dialog, bảng. |
| `radius-xs` | 2px | Nút, ô nhập, ô chat, chip, huy hiệu, mục sidebar. Không có mức bo nào lớn hơn. |
| `space-1` | 4px | Icon với chữ. |
| `space-2` | 8px | Giữa các nút, chip. |
| `space-3` | 12px | Padding khối nhỏ, giữa các bước AI. |
| `space-4` | 16px | Padding thẻ, giữa các tin nhắn liền nhau. |
| `space-5` | 20px | Lề hai bên khung chat. |
| `space-6` | 24px | Giữa các nhóm tin nhắn, lề trên feed. |
| `space-8` | 32px | Giữa các vùng lớn của trang chức năng. |

Trong Tailwind: `rounded-sm`, `rounded-md`, `rounded-lg` đều ra 2px; `rounded-xl` trở lên ra 0px; `shadow-overlay` cho lớp nổi. Viết `rounded-none` cho khung và thẻ.
