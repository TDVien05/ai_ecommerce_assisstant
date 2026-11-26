# Hướng dẫn cho agent AI dựng giao diện

Đọc file này trước khi tạo hoặc sửa bất kỳ giao diện nào trong `client/`. Mục tiêu: mọi màn hình trông như cùng một sản phẩm.

## Quy trình

1. Đọc [README.md](./README.md) (nguyên tắc, màu, chữ, giọng văn) và [COMPONENTS.md](./COMPONENTS.md).
2. Mở trang `/design-system` (`npm run dev`) để xem bố cục chuẩn. Màn mới nên bắt đầu bằng cách sao chép cấu trúc của `client/src/pages/DesignSystemPage.tsx`.
3. Dựng từ component trong `@/components/dongtien` trước, rồi component shadcn trong `@/components/ui`. Chỉ tự viết component mới khi hai nơi đó không có, và viết bằng token của hệ thống.
4. Trước khi báo xong: chạy `npm run build` và `npm run lint` trong `client/`, rồi mở màn hình ở cả theme sáng và tối.

## Bắt buộc

- Màu chỉ lấy từ token Tailwind của theme (`bg-background`, `text-foreground`, `text-muted-foreground`, `border-border`, `bg-primary`, `text-risk-low|mid|high`, `bg-risk-*-soft`, ...). Giao diện là trắng đen.
- Màu chỉ được dùng cho: mức rủi ro (Thấp, Trung bình, Cao), trạng thái đơn, tiền tăng giảm, và cảnh báo. Không có màu thương hiệu, không dùng màu hồng của MoMo.
- Bo góc: khung, thẻ, khối AI, bảng, dialog dùng `rounded-none`; nút, ô nhập, chip, huy hiệu dùng `rounded-sm` (2px). Không dùng `rounded-xl`, `rounded-full` (trừ vòng xoay đang chạy).
- Tách khối bằng viền `border`, không bằng bóng. `shadow-overlay` chỉ cho dropdown, popover, dialog, toast.
- Chữ Geist. Số tiền dùng `<Money />` (tabular-nums, `Intl.NumberFormat('vi-VN')`, số âm dùng "−"). Tiền là số nguyên VND.
- Chat trung tâm là màn hình chính. Việc cụ thể chạy trong luồng riêng; chat trung tâm chỉ nhận `ThreadSummary` và `ProactiveNotice`.
- Mọi thay đổi dữ liệu do AI đề xuất phải đi qua `AgentStep` có nút Duyệt và Hoàn tác, nút Duyệt nói rõ việc ("Duyệt và ghi sổ").
- Mọi con số AI đưa ra dùng `ResultCard` có nguồn và "Cách tính". AI không tự tính tiền (xem `docs/AI_AGENT.md`).
- Mức rủi ro luôn có chữ (`RiskBadge`), không chỉ là màu hay chấm.
- Icon lucide-react 16px, nét 1.75. Không emoji trang trí, không mascot.
- Văn bản giao diện tiếng Việt, AI xưng "mình", gọi người dùng "bạn", câu ngắn, không dấu chấm than, không "Thành công!". Nút là động từ cụ thể, không "OK" hay "Xác nhận" trơn.
- Hỗ trợ `prefers-reduced-motion` (đã có sẵn trong theme và component); đừng thêm animation mới ngoài trạng thái "AI đang làm".
- Focus bàn phím phải thấy rõ; không bỏ outline.

## Cấm

- Mã màu hex/rgb/hsl/oklch viết tay, class màu mặc định của Tailwind (`bg-blue-500`, `text-red-600`...), gradient.
- Thẻ có vạch màu bên trái, thẻ bo tròn lớn, bóng đổ trên thẻ.
- Sửa `client/src/index.css` để thêm màu mới mà chưa cập nhật docs và hỏi người phụ trách giao diện.
- Cho nút "Duyệt" hay "Vẫn duyệt" xuất hiện trong `RiskAlert` hoặc cho AI tự chuyển đơn sang trạng thái đã thanh toán.

## Khi thiếu component

Ghép từ `Block`, `BlockHeader`, `BlockBody`, `BlockFooter` (khung chung của khối AI) và component shadcn. Nếu thứ đó sẽ dùng lại ở nhiều nơi, đặt vào `client/src/components/dongtien/`, export trong `index.ts`, thêm mục vào `COMPONENTS.md` và một ví dụ vào trang `/design-system`.
