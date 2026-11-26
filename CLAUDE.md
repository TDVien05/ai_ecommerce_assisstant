# CLAUDE.md — Quy ước dự án

Đọc `README.md` và `docs/` trước khi code. Khi code và docs mâu thuẫn, hỏi lại thay vì tự đoán.

## Stack
- Backend: Node.js 18+, Express 5, ES Modules (`"type": "module"`), PostgreSQL.
- Frontend: React + Vite + TypeScript, Tailwind v4, shadcn/ui. Import theo alias `@/`.

## Quy tắc backend
- Cấu trúc theo lớp: `routes/` (chỉ parse request + gọi service) → `services/` (business logic) → `db/`.
- Validate mọi input (body, query, tool input của AI) bằng `zod`.
- Express 5 tự bắt lỗi từ async handler, nên không cần bọc try/catch ở từng route. Ném lỗi có `status` + `code`, để `errorHandler` trả JSON.
- Webhook: verify chữ ký/API key **trước** khi parse hay xử lý. Route Messenger cần giữ raw body.
- Tiền: số nguyên VND (`BIGINT` trong DB, `number` trong JS). Không dùng float.
- Thao tác đổi trạng thái đơn + ghi sổ + trừ tồn kho phải nằm trong **một DB transaction**.
- Không log token, app secret, API key, hay SĐT/địa chỉ đầy đủ của khách.
- Không hardcode secret. Mọi config lấy từ `process.env` qua `src/config/env.js` (validate bằng zod khi khởi động).

## Quy tắc AI
- LLM không được tự tính giá hay xác nhận thanh toán. Xem `docs/AI_AGENT.md`.
- Không thêm tool nào cho phép LLM đổi đơn sang `PAID`.

## Quy tắc frontend
- Ưu tiên component shadcn có sẵn (`npx shadcn@latest add <name>`) trước khi tự viết.
- Gọi API qua một client duy nhất `src/lib/api.ts`.
- Format tiền: `new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })`.

## Git
- Conventional commits: `feat:`, `fix:`, `chore:`, `docs:`…
- Mỗi PR gắn với một milestone trong `docs/ROADMAP.md`.
