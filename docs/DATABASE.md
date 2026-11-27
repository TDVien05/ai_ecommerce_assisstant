# Database (PostgreSQL)

Money is stored as `BIGINT` (VND, no decimal part).

## Tables

### `shops`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| name | text | |
| fb_page_id | text UNIQUE | Facebook Page ID |
| fb_page_token | text | Page access token (encrypted at rest) |
| bank_code | text | e.g. `MB`, `VCB` (used to build VietQR) |
| bank_account_number | text | Used to reconcile SePay webhooks |
| bank_account_name | text | |
| created_at | timestamptz | |

### `products`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| shop_id | uuid FK | |
| sku | text | |
| name | text | |
| description | text | Used by the AI for product advice |
| price | bigint | Selling price |
| cost | bigint | Cost price → profit calculation |
| stock | int | |
| variants | jsonb | e.g. `{ "size": ["S","M"], "color": ["white"] }` |
| image_url | text | |
| is_active | boolean | |

### `customers`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| shop_id | uuid FK | |
| psid | text | The customer's Page-scoped ID on Messenger |
| name, phone, address | text | |
| UNIQUE | (shop_id, psid) | |

### `conversations` / `messages`
| Column (`messages`) | Type | Notes |
|---|---|---|
| id | uuid PK | |
| conversation_id | uuid FK | 1 conversation per customer |
| mid | text UNIQUE | Message ID from Meta → prevents duplicate processing |
| role | text | `user` / `assistant` / `tool` |
| content | text | |
| created_at | timestamptz | |

`conversations` also has an `ai_paused boolean` flag: the shop owner turns it on to chat manually (handover).

### `orders`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| shop_id, customer_id | uuid FK | |
| payment_code | text UNIQUE | e.g. `DH8F3K2A`, written by the customer in the transfer note |
| status | text | see the state machine below |
| subtotal, shipping_fee, total | bigint | |
| shipping_name, shipping_phone, shipping_address | text | snapshot at order time |
| expires_at | timestamptz | payment deadline |
| paid_at | timestamptz | |
| risk_level | text | `LOW` / `MEDIUM` / `HIGH` — set by the hard-rule fraud check |
| created_at | timestamptz | |

### `order_items`
`id, order_id, product_id, name_snapshot, variant jsonb, unit_price bigint, unit_cost bigint, quantity int`

### `payment_transactions` (raw from SePay)
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| sepay_id | bigint UNIQUE | deduplicates SePay retries |
| shop_id | uuid FK NULL | resolved from the receiving account / order; deleted with the shop |
| gateway, account_number, code, content, reference_code | text | |
| transfer_type | text | `in` / `out` |
| transfer_amount | bigint | |
| transaction_date | timestamptz | |
| order_id | uuid FK NULL | set when reconciliation matches |
| match_status | text | `MATCHED` / `UNDERPAID` / `NO_ORDER` / `IGNORED` |
| raw | jsonb | original payload |

### `ledger_entries` (income/expense ledger)
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| shop_id | uuid FK | |
| type | text | `INCOME` / `EXPENSE` |
| category | text | `SALES`, `SHIPPING`, `ADS`, `INVENTORY`, `OTHER` |
| amount | bigint | |
| order_id | uuid FK NULL | income from an order |
| note | text | |
| occurred_at | timestamptz | |
| source | text | `manual` / `order` / `bank` / `agent` |
| label_id | uuid FK NULL | `labels` row (user-defined category) |
| counterparty | text | who paid / who was paid |
| raw_description | text | original bank description |
| dedupe_key | text | unique per shop when set → bank imports never duplicate |
| run_id | uuid FK NULL | agent run that wrote the row (for undo) |

### `labels`
`id, shop_id, name, color, created_at`, UNIQUE `(shop_id, name)` — user-defined ledger labels.

### `agent_runs` / `agent_run_events`
One row per agent turn (`RUNNING`, `AWAITING_INPUT`, `AWAITING_APPROVAL`, `DONE`, `CANCELLED`,
`FAILED`, `UNDONE`) with `command`, `plan jsonb`, `result jsonb`, `error`. `agent_run_events`
stores the SSE steps: `(run_id, seq)` unique, `type`, `payload jsonb`.

### `changes` (undo log)
`id, shop_id, run_id, entity, entity_id, action (insert|update|delete), before jsonb, after jsonb, created_at`.
`undoRun` replays a run backwards within 24 hours; it refuses when a row was edited again later.

### `webhook_events` (intake + dedupe)
`provider` (`messenger` / `sepay` / `sim`), `external_id`, `type`, `shop_id`, `payload`,
`status` (`RECEIVED` / `PROCESSED` / `IGNORED` / `FAILED`), `error`, `received_at`, `processed_at`.
UNIQUE `(provider, external_id)` — the same provider retry is stored once and never handled twice.

### `fraud_checks`
`shop_id NULL, provider, external_id, level (LOW|MEDIUM|HIGH), rule, reason, metadata jsonb, created_at`.
One row per check, including signature failures (metadata only, no body).

### `blocklist`
`shop_id, kind (PSID|PHONE|BANK_ACCOUNT), value, reason`, UNIQUE `(shop_id, kind, value)`.

### `todos` / `pins`
`todos`: `title, detail, status (OPEN|DONE|DISMISSED), due_at, order_id`.
`pins`: saved references `(shop_id, kind, ref_id)`, UNIQUE together.

### `ai_usage`
`shop_id NULL, role, model, prompt_tokens, completion_tokens, created_at` — one row per provider call.

## Order state machine

```mermaid
stateDiagram-v2
  [*] --> AWAITING_PAYMENT: AI create_order
  AWAITING_PAYMENT --> PAID: SePay webhook matches
  AWAITING_PAYMENT --> EXPIRED: past expires_at
  AWAITING_PAYMENT --> CANCELLED: customer/shop owner cancels
  PAID --> SHIPPED
  SHIPPED --> LIKELY_DELIVERED: courier reports delivery
  LIKELY_DELIVERED --> DELIVERED
  SHIPPED --> DELIVERED
  DELIVERED --> FOLLOWED_UP: after the follow-up message
  DELIVERED --> REFUNDED
  FOLLOWED_UP --> REFUNDED
```

- `EXPIRED` is set by a scheduled sweep when `expires_at` passes without payment.
- Decrement stock when moving to `PAID` (or, optionally, reserve it at order creation and release it on `EXPIRED`).
- Write the `INCOME/SALES` `ledger_entries` row in the **same DB transaction** that moves the order to `PAID`.

## Recommended indexes
- `orders(shop_id, status, created_at)`
- `ledger_entries(shop_id, occurred_at)`
- `messages(conversation_id, created_at)`
