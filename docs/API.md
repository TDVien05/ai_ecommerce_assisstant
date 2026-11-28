# API

Base URL: `http://localhost:4000`. Uniform error response: `{ "error": { "code": "STRING", "message": "..." } }`.

## 1. Messenger webhook

### `GET /webhooks/messenger` — endpoint verification
Meta sends the query `hub.mode=subscribe`, `hub.verify_token`, `hub.challenge`.
If `hub.verify_token === FB_VERIFY_TOKEN` → return `200` with the value of `hub.challenge` as the body (plain text). Otherwise → `403`.

### `POST /webhooks/messenger` — receive events
- Header `X-Hub-Signature-256: sha256=<hex>`: HMAC-SHA256 of the **raw body**, keyed with `FB_APP_SECRET`. It must be verified on the raw bytes (use `express.raw()` or `express.json({ verify })` to keep the raw body); invalid signature → `403`.
- Return `200` immediately and process asynchronously.
- Payload: `{ object: "page", entry: [{ id: PAGE_ID, messaging: [{ sender: { id: PSID }, message: { mid, text, attachments? } }] }] }`
- Ignore: `message.is_echo === true`, `delivery`/`read` events, already-processed `mid`s.

### Sending messages (outbound, Send API)
```
POST https://graph.facebook.com/{GRAPH_API_VERSION}/me/messages?access_token={PAGE_ACCESS_TOKEN}
{ "recipient": { "id": "<PSID>" }, "messaging_type": "RESPONSE", "message": { "text": "..." } }
```
Sending a QR image: `message.attachment = { type: "image", payload: { url, is_reusable: true } }`.

## 2. SePay webhook

### `POST /webhooks/sepay`
- Header: `Authorization: Apikey <SEPAY_WEBHOOK_API_KEY>`; wrong → `401`.
- Sample body:
```json
{
  "id": 92704,
  "gateway": "Vietcombank",
  "transactionDate": "2024-07-02 11:08:33",
  "accountNumber": "1017588888",
  "code": "DH8F3K2A",
  "content": "DH8F3K2A chuyen tien",
  "transferType": "in",
  "transferAmount": 250000,
  "accumulated": 19077000,
  "subAccount": null,
  "referenceCode": "FT24012345678",
  "description": ""
}
```
- Success → `200 { "success": true }`. Reconciliation rules: [PAYMENT_ANTI_SCAM.md](PAYMENT_ANTI_SCAM.md).

## 3. Dashboard REST API (`/api`, requires the shop owner's JWT)

### Auth
| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/login` | `{ email, password }` → `{ token }` |
| POST | `/api/auth/register` | `{ ownerName, shopName, email, password, acceptedTerms: true }` → `201 { token }`; duplicate email → `409 EMAIL_EXISTS` |
| POST | `/api/auth/demo` | No body → `{ token }` for the server-configured demo account; unavailable configuration → `503 DEMO_UNAVAILABLE` |
| GET | `/api/auth/me` | JWT required → `{ user: { id, email, ownerName }, shop: { id, name, isDemo } }` |

Login, registration and demo are public; `/me` requires `Authorization: Bearer <token>`. `ownerName` can be `null` for existing users. Registration requires nonempty owner and shop names (maximum 120 characters each), a valid email, acceptance of terms and a password of at least 8 characters and at most 72 UTF-8 bytes. Registration and demo are rate limited (`429 TOO_MANY_ATTEMPTS`); login has its own limiter. Demo credentials remain on the server.

### Assistant (planned)

`GET /api/assistant/stream` provides a JWT-protected SSE stream with a snapshot first and heartbeats every 20 seconds. `POST /api/assistant/messages` accepts `{ conversationId, text, attachments }`, persists the message and returns `204`. Ledger write tools create proposals; they do not change the ledger until approval. `POST /api/assistant/steps/:id/answers` accepts `{ questionId, option }` and returns `204`; `POST /api/assistant/steps/:id/approve` returns `{ message }`; `POST /api/assistant/steps/:id/undo` returns `204`. The latter three never call the model. Repeated approval or undo returns `409 STEP_CONFLICT`; another shop's resources return `404`. Quota, rule fallback and guardrails are temporary adapters; upload and alert endpoints remain unimplemented. See [ai-interface.md](ai-interface.md).

### Products
| Method | Path | Description |
|---|---|---|
| GET | `/api/products?q=&page=` | list |
| POST | `/api/products` | create |
| PATCH | `/api/products/:id` | update |
| DELETE | `/api/products/:id` | hide (`is_active=false`) |

### Orders
| Method | Path | Description |
|---|---|---|
| GET | `/api/orders?status=&from=&to=` | `{ items: Order[] }`, lọc theo cửa hàng, tối đa 100 đơn mới nhất; `from` gồm, `to` không gồm |
| GET | `/api/orders/:id` | `{ order: OrderDetail }` gồm hàng và giao dịch đã gắn với đơn của cửa hàng |
| PATCH | `/api/orders/:id/status` | `{ status: "SHIPPING" \| "COMPLETED" \| "CANCELLED" }` → `{ order: Order }`; chỉ PAID → SHIPPING, SHIPPING → COMPLETED, AWAITING_PAYMENT → CANCELLED; không chuyển sang PAID |

### Conversations
| Method | Path | Description |
|---|---|---|
| GET | `/api/conversations` | conversation list |
| GET | `/api/conversations/:id/messages` | history |
| POST | `/api/conversations/:id/messages` | shop owner sends a manual message |
| PATCH | `/api/conversations/:id` | `{ ai_paused: true }`: turn the AI off for this conversation |

### Payments
| Method | Path | Description |
|---|---|---|
| GET | `/api/payments?match_status=` | SePay transactions; filter `UNDERPAID` / `NO_ORDER` for manual handling |
| POST | `/api/payments/:id/assign` | `{ orderId }`: manually assign a transaction to an order |

### Finance
| Method | Path | Description |
|---|---|---|
| GET | `/api/finance/summary?from=&to=` | `{ revenue, cost, grossProfit, expenses, netProfit, orderCount, aov }` |
| GET | `/api/finance/timeseries?from=&to=&interval=day` | revenue by day/week |
| GET | `/api/finance/top-products?from=&to=&limit=5` | best-selling products |
| GET | `/api/finance/ledger` | income/expense ledger |
| POST | `/api/finance/ledger` | create a manual `INCOME` or `EXPENSE` entry with `{ type, kind, channel, category, amount, documentRef, documentDate, industry, note, occurredAt }` → `201 { entry, message }` |
| DELETE | `/api/finance/ledger/:id` | delete a manual entry → `{ message }`; automatic entry → `409 ENTRY_NOT_MANUAL` |
| POST | `/api/finance/ask` | `{ question }` → `{ answer, data }` (AI finance assistant) |

The implemented finance types are defined in `client/src/lib/finance/types.ts`. `GET /ledger` returns `{ items, totals: { income, expense, net }, updatedAt }`; `from` is inclusive, `to` exclusive and dates include a timezone. Legacy entries can have `kind` or `channel` set to `null` when unknown. `GET /summary`, `/timeseries` and `/top-products` return `409 FINANCE_INCOMPLETE` if the period has no ledger data or contains unclassified entries; summary also requires known order costs. These cases are not represented as zero. Other finance endpoints remain proposals.

## References
- Messenger Webhooks: https://developers.facebook.com/docs/messenger-platform/webhooks
- Messenger Quick Start (Send API, page access token): https://developers.facebook.com/documentation/business-messaging/messenger-platform/getting-started/quick-start
- SePay Webhook: https://developer.sepay.vn/en/sepay-webhooks/tich-hop-webhook

### Cảnh báo trợ lý

`GET /api/alerts?status=OPEN|HELD|DISMISSED` trả `{ items: Alert[] }`. `POST /api/alerts/:id/hold` và `/dismiss` trả `{ alert }`; chỉ đổi trạng thái cảnh báo, trả 404 nếu khác cửa hàng và 409 nếu đã xử lý. `POST /api/assistant/alerts/:id/safe-action` chuyển cảnh báo sang HELD. `POST /api/assistant/notices/:id/dismiss` chỉ tắt thông báo trong chat; không đổi trạng thái cảnh báo hoặc đơn.
