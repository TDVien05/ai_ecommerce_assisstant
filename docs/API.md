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

The eight JWT-protected endpoints and SSE contract are specified in [ai-interface.md](ai-interface.md). The client interface exists; the server endpoints, agent and guardrails are not implemented yet.

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
