# AGENTS.md — Quy định dành cho agent AI

Tài liệu này áp dụng cho mọi agent AI (Claude Code, Cursor, Copilot, Codex và các công cụ tương tự) khi làm việc trong kho mã này. Quy định về stack, backend và Git nằm trong `CLAUDE.md`; tài liệu này bổ sung các quy định bắt buộc về giao diện và cách làm việc.

## 1. Quy định bắt buộc về giao diện

1.1. Trước khi tạo, sửa hoặc xóa bất kỳ thành phần giao diện nào trong thư mục `client/`, agent phải đọc toàn bộ các tài liệu sau theo thứ tự:

1. `docs/design-system/AGENTS.md` (các yêu cầu bắt buộc và các điều bị cấm);
2. `docs/design-system/README.md` (nguyên tắc, bố cục, màu, chữ, hình khối, giọng văn);
3. `docs/design-system/COMPONENTS.md` (danh mục và cách dùng component).

1.2. Giao diện phải được dựng từ các thành phần của hệ thống thiết kế Flowy: theme trong `client/src/index.css`, component trong `client/src/components/flowy/` và component shadcn trong `client/src/components/ui/`. Trang `/design-system` (tệp `client/src/pages/DesignSystemPage.tsx`) là mẫu tham chiếu về bố cục và cách ghép component.

1.3. Agent không được tự đặt ra màu sắc, bo góc, bóng đổ, phông chữ hoặc kiểu trình bày nằm ngoài hệ thống thiết kế. Khi hệ thống chưa có thành phần cần thiết, agent ghép từ các thành phần hiện có; nếu cần bổ sung hệ thống, agent nêu đề xuất bằng văn bản cho người phụ trách giao diện thay vì tự thay đổi theme.

1.4. Các nội dung sau là bắt buộc đối với mọi màn hình:

- chỉ dùng token màu của theme (trắng và đen), màu chỉ dành cho mức rủi ro, trạng thái đơn hàng và tiền tăng giảm;
- bo góc tối đa 2px (`rounded-none` cho khung và thẻ, `rounded-sm` cho nút, ô nhập, huy hiệu);
- tách khối bằng viền, không dùng bóng đổ ngoài lớp nổi (hộp thoại, menu, thông báo);
- số tiền hiển thị bằng component `Money`, là số nguyên đồng Việt Nam;
- mọi thay đổi dữ liệu do AI đề xuất phải đi qua `AgentStep` có nút Duyệt và Hoàn tác;
- mức rủi ro luôn kèm nhãn chữ;
- văn bản giao diện bằng tiếng Việt, theo giọng văn quy định trong `docs/design-system/README.md`.

## 2. Quy trình thực hiện

2.1. Đọc tài liệu theo mục 1.1 và xác nhận trong phần báo cáo cuối cùng rằng đã đọc.

2.2. Dựng màn hình bằng component có sẵn. Chỉ tạo component mới khi không có component phù hợp; component mới đặt trong `client/src/components/flowy/`, được xuất trong `index.ts`, được mô tả trong `docs/design-system/COMPONENTS.md` và có ví dụ trên trang `/design-system`.

2.3. Trước khi báo hoàn thành, agent phải:

- chạy `npm run build` và `npm run lint` trong thư mục `client/`;
- kiểm tra màn hình ở cả chế độ sáng và chế độ tối;
- rà soát để bảo đảm không có mã màu viết tay, không có lớp màu mặc định của Tailwind (ví dụ `bg-blue-500`), không có gradient, không có bo góc lớn hơn 2px.

2.4. Khi nội dung trong `docs/design-system/` mâu thuẫn với yêu cầu của người dùng hoặc với mã nguồn, agent không tự suy đoán; agent dừng lại và hỏi người phụ trách.

## 3. Quy định về Git và tài liệu

3.1. Commit và mô tả Pull Request không được chứa dòng "Generated with Claude Code" hoặc dòng tương tự do công cụ sinh ra, không có dòng `Co-Authored-By`, không có dòng `Claude-Session`, không có dòng ghi nhận người yêu cầu hoặc nguồn tạo ra thay đổi.

3.2. Không đưa vào commit, mô tả Pull Request hoặc tài liệu bất kỳ liên kết nào dẫn tới dự án, cuộc trò chuyện, phiên làm việc hoặc tài liệu nội bộ của công cụ AI (ví dụ các địa chỉ `claude.ai`).

3.3. Không commit tệp `.env`, khóa API, mật khẩu hoặc token. Kho mã này là kho công khai.

3.4. Không đẩy trực tiếp lên nhánh `main`; mọi thay đổi đi qua nhánh riêng và Pull Request. Commit theo quy ước `feat:`, `fix:`, `chore:`, `docs:` như trong `CLAUDE.md`.

## 4. Quy định về dữ liệu và AI

4.1. Mô hình ngôn ngữ không được tự tính giá, không được tự xác nhận thanh toán và không có công cụ nào cho phép chuyển đơn hàng sang trạng thái đã thanh toán. Chi tiết tại `docs/AI_AGENT.md`.

4.2. Số liệu tiền hiển thị trên giao diện phải lấy từ máy chủ và có dòng nguồn kèm mục "Cách tính" (component `ResultCard`); agent không tự tính hoặc ước lượng số tiền trong mã giao diện.
