# AI Sales Assistant cho Facebook Page

Trợ lý AI giúp chủ shop bán hàng qua Facebook Messenger:

1. Khách nhắn tin cho Page → AI tự trả lời (tư vấn sản phẩm, giá, tồn kho).
2. AI thu thập thông tin và **tự tạo đơn**, gửi xác nhận + mã QR thanh toán về Messenger.
3. **Chống scam:** đơn chỉ được xác nhận khi webhook ngân hàng (SePay) báo tiền đã vào tài khoản. Hệ thống không tin ảnh chụp màn hình chuyển khoản.
4. Mỗi đơn đã thanh toán được ghi vào sổ thu chi → **trợ lý tài chính** cho chủ shop (doanh thu, lợi nhuận, sản phẩm bán chạy, hỏi đáp bằng ngôn ngữ tự nhiên).

## Tech stack

| Tầng | Công nghệ |
|---|---|
| Backend | Node.js 18+, Express 5 |
| Frontend (dashboard chủ shop) | React + Vite + TypeScript, Tailwind CSS v4, shadcn/ui |
| Database | PostgreSQL |
| Kênh chat | Meta Messenger Platform (Webhook + Send API) |
| Xác minh thanh toán | SePay Webhook (biến động số dư) |
| AI | LLM có function calling (provider cấu hình qua env) |

## Tài liệu

| File | Nội dung |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Kiến trúc, các luồng chính (sequence diagram) |
| [docs/DATABASE.md](docs/DATABASE.md) | Schema dữ liệu, trạng thái đơn hàng |
| [docs/API.md](docs/API.md) | Webhook + REST API cho dashboard |
| [docs/AI_AGENT.md](docs/AI_AGENT.md) | System prompt, các tool AI được gọi, guardrails |
| [docs/PAYMENT_ANTI_SCAM.md](docs/PAYMENT_ANTI_SCAM.md) | Quy tắc xác minh chuyển khoản |
| [docs/SETUP.md](docs/SETUP.md) | Cài đặt local, biến môi trường, cấu hình Facebook App và SePay |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Các milestone và checklist công việc |
| [CLAUDE.md](CLAUDE.md) | Quy ước code (dùng cho AI coding assistant và cho team) |

## Cấu trúc repo (dự kiến)

```
sales-assistant/
├── server/                 # Express API
│   ├── src/
│   │   ├── routes/         # webhook.messenger, webhook.sepay, orders, products, finance
│   │   ├── services/       # messenger, ai, order, payment, finance
│   │   ├── middlewares/    # verifyFbSignature, verifySepayKey, errorHandler
│   │   ├── db/             # schema + migrations
│   │   └── index.js
│   └── .env.example
├── client/                 # React Vite + shadcn dashboard
│   └── src/{pages,components/ui,lib}
├── docs/
└── README.md
```

## Chạy nhanh

Xem chi tiết ở [docs/SETUP.md](docs/SETUP.md).

### Docker (PostgreSQL + server + client, có hot reload)

```bash
cp server/.env.example server/.env   # điền secret nếu cần
docker compose up --build            # client :5173, server :4000, db :5432
```

Server tự chạy migration khi khởi động. Sau khi đổi `package.json`, chạy `docker compose up --build -V` để cài lại `node_modules` trong container.

### Không dùng Docker

```bash
# backend
cd server && npm install && npm run dev      # http://localhost:4000

# frontend
cd client && npm install && npm run dev      # http://localhost:5173
```
