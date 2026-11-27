# Roadmap

## M0 — Foundation
- [ ] Init monorepo `server/` + `client/`, ESLint/Prettier, `.gitignore`, `.env.example`
- [ ] PostgreSQL + migrations for the tables in [DATABASE.md](DATABASE.md)
- [ ] `errorHandler` middleware, logger, `GET /health` healthcheck

## M1 — Messenger echo bot
- [ ] `GET /webhooks/messenger` handshake
- [ ] `POST /webhooks/messenger` + verify `X-Hub-Signature-256` on the raw body
- [ ] Store customer/conversation/message, deduplicate by `mid`
- [ ] Echo the message back via the Send API → **Done when:** messaging the Page returns the same content

## M2 — AI product advice
- [ ] Product CRUD (API + dashboard page)
- [ ] `ai.service` + `search_products` tool
- [ ] Asynchronous processing after returning 200 to Meta
- [ ] Pass test cases 1–2 in [AI_AGENT.md](AI_AGENT.md)

## M3 — Order creation
- [ ] Tools `get_customer_profile`, `create_order`, `cancel_order`
- [ ] Generate `payment_code` + VietQR image sent via Messenger
- [ ] Expiry job for `AWAITING_PAYMENT` orders
- [ ] Pass test cases 3–4

## M4 — Payments & anti-scam
- [ ] `POST /webhooks/sepay` following the checklist in [PAYMENT_ANTI_SCAM.md](PAYMENT_ANTI_SCAM.md)
- [ ] `check_payment_status` tool, confirmation message to the customer
- [ ] "Transactions needing attention" page (`UNDERPAID`, `NO_ORDER`)
- [ ] Pass test cases 5–6 using SePay Test mode

## M5 — Finance assistant
- [ ] Write `ledger_entries` when an order is PAID, expense entry form
- [ ] summary / timeseries / top-products APIs
- [ ] Dashboard: KPI cards, revenue chart, top products table
- [ ] `/api/finance/ask` + chat UI

## M6 — Operations
- [ ] Handover to a human (`ai_paused`), conversations page
- [ ] Shop owner auth (JWT)
- [ ] Deploy (server + Postgres + HTTPS), prepare for Meta App Review
- [ ] Pass test case 7, error logging and monitoring
