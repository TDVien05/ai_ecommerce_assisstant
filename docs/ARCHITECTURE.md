# Architecture

## Overview

```mermaid
flowchart LR
  KH[Customer<br/>Messenger] -->|message| META[Meta Messenger Platform]
  META -->|POST webhook| API[Express Server]
  API -->|Send API| META
  API <--> LLM[LLM Provider]
  API <--> DB[(PostgreSQL)]
  BANK[Bank] --> SEPAY[SePay]
  SEPAY -->|POST balance-change webhook| API
  OWNER[Shop owner] --> WEB[React Dashboard]
  WEB -->|REST /api| API
```

## Backend layering

```
request → routes/ → middlewares/ → controllers/ → services/ → db/
                                        ↓ error (throw HttpError)
                                   errorHandler → { error: { code, message } }
```

| Layer | Does | Does not |
|---|---|---|
| `routes/` | Declares method + path, attaches middleware (signature/API key verification, body parser, `validate(schema)`), points to a controller | Write inline handlers, call services/db |
| `controllers/` | Reads `req.body` / `req.params` / `req.validatedQuery`, calls a service, picks the status code, returns JSON | Business logic, money calculations, opening transactions, accessing `db/` |
| `services/` | Business logic, transactions (order status change + ledger entry + stock decrement), external API calls, calls `db/` | Read `req` / write `res` |
| `db/` | Connection pool, migrations | |

Naming: `routes/orders/orders.js` → `controllers/orders/orders.controller.js` → `services/orders/order.service.js`.
Controllers are async functions; Express 5 forwards their errors to `errorHandler`, so no try/catch is needed.

Example:

```js
// routes/orders/orders.js
ordersRouter.post('/', validate(createOrderBody), ordersController.create)

// controllers/orders/orders.controller.js
export const create = async (req, res) => {
  res.status(201).json(await orderService.create(req.body))
}
```

### Feature folders

Every layer keeps its role, and inside each layer the files are grouped into **one folder per feature**, the same way `services/ai/` and `services/assistant/` already are. A feature uses the same folder name in every layer it appears in.

- Files keep their layer suffix (`.controller.js`, `.service.js`) so they stay easy to search for.
- Inside a folder, a prefix that only repeats the folder name is dropped: `routes/webhook.sepay.js` becomes `routes/webhook/sepay.js`, `db/assistant.steps.js` becomes `db/assistant/steps.js`.
- A new feature gets a new folder in each layer it needs; no new files directly under `routes/`, `controllers/`, `services/` or `db/`.
- Only shared entry points stay at a layer root: `routes/index.js` (mounts every router), and in `db/` the `pool.js`, `migrate.js`, `seed.js`, `migrations/` and the shared data-access layer `repos/`.
- `middlewares/`, `lib/` and `config/` are shared across features and stay flat.

| Feature | `routes/` | `controllers/` | `services/` | `db/` |
|---|---|---|---|---|
| `ai` | | | `client.js`, `toolLoop.js`, `prompts/`… (model layer) | |
| `alerts` | `alerts.js` | `alerts.controller.js` | `alerts.service.js` | `alerts.js` |
| `assistant` | `assistant.js` | `assistant.controller.js` | `assistant.service.js`, `agent.js`, `tools/`… | `assistant.js`, `files.js`, `steps.js`, `threads.js` |
| `auth` | `auth.js` | `auth.controller.js` | `auth.service.js` | `users.js` |
| `demo` | `demo.js` | `demo.controller.js` | `demo.service.js` | |
| `dev` | `dev.js` | `dev.controller.js` | | |
| `finance` | `finance.js` | `finance.controller.js` | `finance.service.js`, `ledger.service.js` | `finance.js`, `ledger.js`, `ledger.write.js` |
| `guardrail` (planned, NV-00) | | | `guardrail.service.js` | |
| `health` | `health.js` | `health.controller.js` | `health.service.js` | |
| `orders` | `orders.js` | `orders.controller.js` | `order.service.js` | `orders.js` |
| `payments` | | | `payment.service.js`, `fraud.service.js` | |
| `shop` | | | `shop.service.js` | `shop.js` |
| `webhook` | `messenger.js`, `sepay.js`, `sim.js` | `messenger.controller.js`, `sepay.controller.js`, `sim.controller.js` | `webhook.service.js`, `sim.service.js` | |

## Backend modules

| Module | Responsibility |
|---|---|
| `messenger.service` | Parses webhook events, sends messages (text, QR image, quick replies) via the Send API |
| `ai.service` | Calls the LLM, keeps conversation history, executes tools (`search_products`, `create_order`…) |
| `order.service` | Creates/updates orders, generates unique payment codes, manages the status lifecycle |
| `payment.service` | Receives SePay webhooks, reconciles transactions with orders, deduplicates, marks orders PAID |
| `finance.service` | Writes the income/expense ledger, aggregates reports, answers the shop owner's finance questions |

## Flow 1 — Customer messages → AI replies

```mermaid
sequenceDiagram
  participant C as Customer
  participant M as Meta
  participant S as Server
  participant AI as LLM
  C->>M: "Áo thun trắng size M còn không?" (Is the white T-shirt in size M in stock?)
  M->>S: POST /webhooks/messenger (X-Hub-Signature-256)
  S->>S: Verify signature, return 200 immediately
  S->>S: Store message, load conversation history
  S->>AI: messages + tools
  AI-->>S: tool_call search_products("áo thun trắng", size M)
  S->>S: Query DB
  S->>AI: tool result
  AI-->>S: Reply
  S->>M: Send API (recipient = PSID)
  M->>C: Reply message
```

Note: return `200` to Meta first and run the AI **asynchronously** (avoids timeouts/retries that cause duplicate replies). Deduplicate by `message.mid`.

## Flow 2 — Order creation + payment + anti-scam

```mermaid
sequenceDiagram
  participant C as Customer
  participant S as Server
  participant SP as SePay
  C->>S: Places the order (name, phone, address, products)
  S->>S: create_order → status AWAITING_PAYMENT, payment_code = DH8F3K2A
  S->>C: Order summary + VietQR image (amount + transfer note DH8F3K2A)
  C->>C: Makes the bank transfer
  SP->>S: POST /webhooks/sepay (Authorization: Apikey ...)
  S->>S: Reconcile: code, amount, account number, dedupe by id
  S->>S: Order → PAID, write income entry to finance
  S->>C: "Received 250,000đ in full, order DH8F3K2A is confirmed"
```

If the customer sends a "transfer done" screenshot before any webhook arrives → the AI replies that the system is waiting for the bank's confirmation and does **not** confirm the order. Details: [PAYMENT_ANTI_SCAM.md](PAYMENT_ANTI_SCAM.md).

## Flow 3 — Finance assistant

```mermaid
sequenceDiagram
  participant O as Shop owner
  participant W as Dashboard
  participant S as Server
  participant AI as LLM
  O->>W: "How much profit this week? What sells best?"
  W->>S: POST /api/finance/ask
  S->>AI: question + tools (get_summary, get_top_products)
  AI-->>S: tool_call get_summary(from, to)
  S->>S: Aggregate SQL (written by the server, never generated by the LLM)
  S->>AI: figures
  AI-->>S: Answer with figures
  S->>W: { answer, data }
```

## References

- Meta Messenger Webhooks: https://developers.facebook.com/docs/messenger-platform/webhooks
- SePay Webhooks: https://developer.sepay.vn/en/sepay-webhooks/tich-hop-webhook
