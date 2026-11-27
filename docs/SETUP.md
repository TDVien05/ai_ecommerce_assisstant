# Setup

## Yêu cầu
- Node.js 18+ (yêu cầu của Express 5)
- PostgreSQL (local hoặc Docker)
- Tunnel public HTTPS để Meta và SePay gọi được webhook về máy local (ngrok, cloudflared…)

## 1. Khởi tạo repo

```bash
mkdir sales-assistant && cd sales-assistant && git init

# Backend
mkdir server && cd server
npm init -y
npm install express@latest pg dotenv zod jsonwebtoken bcrypt
npm install -D nodemon
cd ..

# Frontend
npm create vite@latest client -- --template react-ts
cd client && npm install
npm install tailwindcss @tailwindcss/vite react-router-dom
```

## 2. shadcn/ui cho Vite
1. Thêm alias `@` → `./src` vào `tsconfig.json` + `tsconfig.app.json` (`compilerOptions.paths`) và `vite.config.ts` (`resolve.alias`). Thêm plugin `tailwindcss()`.
2. Thay nội dung `src/index.css` bằng `@import "tailwindcss";`.
3. Chạy:
```bash
npx shadcn@latest init -t vite
npx shadcn@latest add button card table badge input dialog tabs sonner
```
4. Thêm proxy cho dev trong `vite.config.ts`: `server.proxy = { '/api': 'http://localhost:4000' }`.

## 3. Biến môi trường (`server/.env.example`)

```env
PORT=4000
DATABASE_URL=postgres://postgres:postgres@localhost:5432/sales_assistant
JWT_SECRET=change-me

# Meta
FB_APP_SECRET=
FB_VERIFY_TOKEN=any-random-string
FB_PAGE_ACCESS_TOKEN=
GRAPH_API_VERSION=v23.0         # kiểm tra version hiện hành trong App Dashboard

# SePay
SEPAY_WEBHOOK_API_KEY=

# AI (OpenAI-compatible chat completions)
AI_BASE_URL=
AI_API_KEY=
AI_MODEL=

# Ngân hàng nhận tiền (tạo VietQR)
BANK_CODE=MB
BANK_ACCOUNT_NUMBER=
BANK_ACCOUNT_NAME=
```

### Quy tắc bảo mật

Repo này công khai.

1. Tạo file thật từ file mẫu rồi điền giá trị: `server/.env`, `client/.env`, và `.env` ở gốc (chỉ cho Docker Compose). Danh sách biến đầy đủ nằm trong các file `.env.example`.
2. Không commit `.env`, khóa, chứng chỉ hoặc file thông tin đăng nhập. `.gitignore` đã chặn; không dùng `git add -f` với các file này.
3. Mã máy chủ đọc cấu hình qua `server/src/config/env.js`. Biến `VITE_*` hiển thị công khai trên trình duyệt nên không được chứa bí mật.
4. Bản triển khai đặt biến trong phần cấu hình của dịch vụ, không đưa file `.env` lên.
5. Nếu lỡ đẩy một khóa lên repo, thu hồi và tạo khóa mới ngay. Xóa commit là chưa đủ.

## 4. Cấu hình Facebook App
1. Tạo app tại https://developers.facebook.com, thêm sản phẩm **Messenger**.
2. Kết nối Page → tạo **Page access token** → `FB_PAGE_ACCESS_TOKEN`.
3. App Settings → Basic → **App Secret** → `FB_APP_SECRET`.
4. Webhooks: Callback URL = `https://<tunnel>/webhooks/messenger`, Verify Token = `FB_VERIFY_TOKEN`. Subscribe ít nhất `messages` (thêm `messaging_postbacks` nếu dùng nút).
5. Test handshake ở local:
```bash
curl "http://localhost:4000/webhooks/messenger?hub.mode=subscribe&hub.verify_token=<FB_VERIFY_TOKEN>&hub.challenge=CHALLENGE_ACCEPTED"
# → CHALLENGE_ACCEPTED
```
6. Khi app còn ở chế độ development, chỉ tài khoản có role trong app mới nhắn thử được. Muốn mở cho khách thật thì phải qua App Review. Xem yêu cầu tại trang Messenger Platform.

## 5. Cấu hình SePay
1. Đăng ký tại https://my.sepay.vn, liên kết tài khoản ngân hàng.
2. Cấu hình chung → **Cấu trúc mã thanh toán**: prefix `DH`.
3. Tích hợp Webhook → Thêm: URL `https://<tunnel>/webhooks/sepay`, loại giao dịch **Tiền vào**, xác thực **API Key** → `SEPAY_WEBHOOK_API_KEY`, bật "Chỉ gửi khi có mã thanh toán".
4. Dùng **Test mode** để giả lập giao dịch.

## Tham khảo
- Express installing: https://expressjs.com/en/starter/installing.html
- shadcn/ui Vite: https://ui.shadcn.com/docs/installation/vite
- Messenger Quick Start: https://developers.facebook.com/documentation/business-messaging/messenger-platform/getting-started/quick-start
- SePay Webhook: https://developer.sepay.vn/en/sepay-webhooks/tich-hop-webhook
