# Roadmap

## M0 — Nền tảng
- [ ] Init monorepo `server/` + `client/`, ESLint/Prettier, `.gitignore`, `.env.example`
- [ ] PostgreSQL + migration cho các bảng trong [DATABASE.md](DATABASE.md)
- [ ] Middleware `errorHandler`, logger, healthcheck `GET /health`

## M1 — Messenger echo bot
- [ ] `GET /webhooks/messenger` handshake
- [ ] `POST /webhooks/messenger` + verify `X-Hub-Signature-256` trên raw body
- [ ] Lưu customer/conversation/message, chống trùng theo `mid`
- [ ] Gửi lại tin nhắn qua Send API (echo) → **Done khi:** nhắn Page và nhận lại đúng nội dung

## M2 — AI tư vấn
- [ ] CRUD sản phẩm (API + trang dashboard)
- [ ] `ai.service` + tool `search_products`
- [ ] Xử lý bất đồng bộ sau khi trả 200 cho Meta
- [ ] Pass test case 1–2 trong [AI_AGENT.md](AI_AGENT.md)

## M3 — Tạo đơn
- [ ] Tool `get_customer_profile`, `create_order`, `cancel_order`
- [ ] Sinh `payment_code` + ảnh VietQR gửi qua Messenger
- [ ] Job hết hạn đơn `AWAITING_PAYMENT`
- [ ] Pass test case 3–4

## M4 — Thanh toán & chống scam
- [ ] `POST /webhooks/sepay` theo checklist trong [PAYMENT_ANTI_SCAM.md](PAYMENT_ANTI_SCAM.md)
- [ ] Tool `check_payment_status`, tin xác nhận cho khách
- [ ] Trang "Giao dịch cần xử lý" (`UNDERPAID`, `NO_ORDER`)
- [ ] Pass test case 5–6 bằng SePay Test mode

## M5 — Trợ lý tài chính
- [ ] Ghi `ledger_entries` khi đơn PAID, form nhập khoản chi
- [ ] API summary / timeseries / top-products
- [ ] Dashboard: KPI cards, biểu đồ doanh thu, bảng top sản phẩm
- [ ] `/api/finance/ask` + chat UI

## M6 — Vận hành
- [ ] Handover sang người thật (`ai_paused`), trang hội thoại
- [ ] Auth chủ shop (JWT)
- [ ] Deploy (server + Postgres + HTTPS), chuẩn bị App Review của Meta
- [ ] Pass test case 7, log và giám sát lỗi
