# Setup

## Requirements
- Node.js 18+ (required by Express 5)
- PostgreSQL (local or Docker)
- A public HTTPS tunnel so Meta and SePay can reach webhooks on your local machine (ngrok, cloudflared…)

## 1. Initialize the repo

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

## 2. shadcn/ui for Vite
1. Add the `@` → `./src` alias to `tsconfig.json` + `tsconfig.app.json` (`compilerOptions.paths`) and `vite.config.ts` (`resolve.alias`). Add the `tailwindcss()` plugin.
2. Replace the contents of `src/index.css` with `@import "tailwindcss";`.
3. Run:
```bash
npx shadcn@latest init -t vite
npx shadcn@latest add button card table badge input dialog tabs sonner
```
4. Add a dev proxy in `vite.config.ts`: `server.proxy = { '/api': 'http://localhost:4000' }`.

## 3. Environment variables (`server/.env.example`)

```env
PORT=4000
DATABASE_URL=postgres://postgres:postgres@localhost:5432/sales_assistant
JWT_SECRET=change-me

# Meta
FB_APP_SECRET=
FB_VERIFY_TOKEN=any-random-string
FB_PAGE_ACCESS_TOKEN=
GRAPH_API_VERSION=v23.0         # check the current version in the App Dashboard

# SePay
SEPAY_WEBHOOK_API_KEY=

# AI (OpenAI-compatible chat completions; the team uses OpenRouter)
AI_BASE_URL=https://openrouter.ai/api/v1
AI_API_KEY=
AI_MODEL=                       # default model, e.g. <provider>/<model>
AI_MODEL_AGENT=                 # per-role overrides, fall back to AI_MODEL
AI_MODEL_BOT=                   # agent/bot need tool support, vision needs image input
AI_MODEL_CLASSIFY=
AI_MODEL_VISION=
AI_MODEL_FRAUD=
AI_MOCK=false                   # true: scripted mock, no provider calls
AI_DAILY_RUN_LIMIT=50
AI_TIMEOUT_MS=30000

# Receiving bank account (VietQR)
BANK_CODE=MB
BANK_ACCOUNT_NUMBER=
BANK_ACCOUNT_NAME=
```

## 4. Facebook App configuration
1. Create an app at https://developers.facebook.com and add the **Messenger** product.
2. Connect the Page → generate a **Page access token** → `FB_PAGE_ACCESS_TOKEN`.
3. App Settings → Basic → **App Secret** → `FB_APP_SECRET`.
4. Webhooks: Callback URL = `https://<tunnel>/webhooks/messenger`, Verify Token = `FB_VERIFY_TOKEN`. Subscribe to at least `messages` (add `messaging_postbacks` if you use buttons).
5. Test the handshake locally:
```bash
curl "http://localhost:4000/webhooks/messenger?hub.mode=subscribe&hub.verify_token=<FB_VERIFY_TOKEN>&hub.challenge=CHALLENGE_ACCEPTED"
# → CHALLENGE_ACCEPTED
```
6. While the app is in development mode, only accounts with a role in the app can message it. Opening it to real customers requires App Review; see the requirements on the Messenger Platform page.

## 5. SePay configuration
1. Sign up at https://my.sepay.vn and link your bank account.
2. General settings → **Cấu trúc mã thanh toán** (payment code structure): prefix `DH`.
3. Webhook integration → Add: URL `https://<tunnel>/webhooks/sepay`, transaction type **Tiền vào** (incoming), authentication **API Key** → `SEPAY_WEBHOOK_API_KEY`, enable "Chỉ gửi khi có mã thanh toán" (only send when a payment code is present).
4. Use **Test mode** to simulate transactions.

## 6. Production domains
The frontend (Vercel) and the API (Railway) run on different domains, so two variables must be set:

| Where | Variable | Value |
|---|---|---|
| Vercel (Production) | `VITE_API_BASE_URL` | `https://flowy.api.vientruong.site` |
| Railway (server) | `CORS_ORIGIN` | `https://flowy.vientruong.site` |

- `VITE_API_BASE_URL` is baked in at build time: redeploy the frontend after changing it. Leave it empty in dev (the Vite proxy handles `/api`) and in the single-image Docker build (same origin).
- `CORS_ORIGIN` accepts a comma-separated list, e.g. `https://flowy.vientruong.site,http://localhost:5173`. Write origins without a trailing path.
- Auth uses a Bearer token in `localStorage`, so no cookie or `SameSite` settings are involved.

## References
- Express installing: https://expressjs.com/en/starter/installing.html
- shadcn/ui Vite: https://ui.shadcn.com/docs/installation/vite
- Messenger Quick Start: https://developers.facebook.com/documentation/business-messaging/messenger-platform/getting-started/quick-start
- SePay Webhook: https://developer.sepay.vn/en/sepay-webhooks/tich-hop-webhook

## Kiểm thử đầu cuối trong Docker

Chạy một lệnh sau từ thư mục gốc để xây dựng và thực hiện hai vòng kiểm thử bằng trình duyệt và AI giả lập:

```sh
docker compose -f docker-compose.e2e.yml up --build --abort-on-container-exit --exit-code-from e2e
```

Dự án Compose dùng mạng riêng, không mở cổng và cơ sở dữ liệu tạm trong bộ nhớ. Tài khoản, đơn, cảnh báo và giao dịch được tạo trong lần chạy; không nạp khóa hay dữ liệu thật. Nếu lỗi, ảnh được ghi vào `.e2e-artifacts/`. Sau khi chạy, dọn container và volume của dự án thử bằng `docker compose -f docker-compose.e2e.yml down -v`.
