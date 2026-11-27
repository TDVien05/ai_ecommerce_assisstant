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
- The event is stored in `webhook_events` before the response; processing continues in the
  background. A repeated `id` answers `200 { "success": true, "duplicate": true }` and is not
  processed again.

### `POST /webhooks/sim` — in-app simulator
- Header `X-Sim-Signature: sha256=<hex>`: HMAC-SHA256 of the **raw body** keyed with
  `SIM_WEBHOOK_SECRET`; wrong → `403` (a HIGH `fraud_checks` row is written, metadata only).
- Body is either a Messenger payload (`object: "page"`) or a SePay payload (`transferAmount`).
- It enters the same `ingest` pipe with `provider = "sim"`, so the same handlers run.
- See [events.md](events.md).

### `POST /api/dev/simulate-payment`
- Requires the shop JWT. Body `{ "orderId": "<uuid>" }`.
- Builds the SePay payload for that order (amount + `payment_code`) and pushes it through the
  simulator pipe. `202 { success, eventId, orderId, paymentCode, amount }`.

## 3. Dashboard REST API (`/api`, requires the shop owner's JWT)

### Auth
| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/login` | `{ email, password }` → `{ token }` |
| GET | `/api/auth/me` | current shop info |

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
| GET | `/api/orders?status=&from=&to=` | list |
| GET | `/api/orders/:id` | details + items + payment transactions |
| PATCH | `/api/orders/:id/status` | `{ status: "SHIPPING" \| "COMPLETED" \| "CANCELLED" }` |

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
| POST | `/api/finance/ledger` | add a manual expense `{ type: "EXPENSE", category, amount, note, occurredAt }` |
| POST | `/api/finance/ask` | `{ question }` → `{ answer, data }` (AI finance assistant) |

## References
- Messenger Webhooks: https://developers.facebook.com/docs/messenger-platform/webhooks
- Messenger Quick Start (Send API, page access token): https://developers.facebook.com/documentation/business-messaging/messenger-platform/getting-started/quick-start
- SePay Webhook: https://developer.sepay.vn/en/sepay-webhooks/tich-hop-webhook
