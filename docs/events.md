# Webhook events

Every external event enters through one pipe: `services/webhook/webhook.service.js#ingest`.
Providers: `messenger`, `sepay`, `sim` (the in-app simulator).

## Intake contract

```
provider webhook → verify signature/API key → ingest({ provider, externalId, type, payload })
  1. store in webhook_events, UNIQUE (provider, external_id)
  2. duplicate → 200, nothing runs twice
  3. hard fraud rules (services/payments/fraud.service.js) → a fraud_checks row every time
  4. HIGH finding → status IGNORED, handler never runs
  5. dispatch to every handler registered with onEvent(type, handler)
  6. status PROCESSED (or FAILED with the error message)
```

The event is stored **before** the HTTP 200. Processing runs in `setImmediate`, so a slow
handler never makes Meta/SePay retry. `webhook_events.status` is one of
`RECEIVED` / `PROCESSED` / `IGNORED` / `FAILED`.

## `messenger.message`

Payload (raw from Meta, one messaging event per call):

```json
{
  "object": "page",
  "entry": [{
    "id": "<PAGE_ID>", "time": 1732700000000,
    "messaging": [{
      "sender": { "id": "<PSID>" },
      "recipient": { "id": "<PAGE_ID>" },
      "timestamp": 1732700000000,
      "message": { "mid": "m_ABC123", "text": "Áo này còn size M không?" }
    }]
  }]
}
```

- `externalId` = `message.mid`
- Shop resolved from `entry[0].id` → `shops.fb_page_id`
- Echoes (`message.is_echo`), `delivery`, `read`, `optin` are not forwarded

## `messenger.postback`

```json
{
  "object": "page",
  "entry": [{
    "id": "<PAGE_ID>", "time": 1732700000000,
    "messaging": [{
      "sender": { "id": "<PSID>" },
      "recipient": { "id": "<PAGE_ID>" },
      "timestamp": 1732700000000,
      "postback": { "title": "Xem đơn", "payload": "VIEW_ORDER" }
    }]
  }]
}
```

- `externalId` = `<PSID>:<timestamp>` (Meta sends no `mid` for postbacks)

## `payment.received`

SePay shape (also what `/api/dev/simulate-payment` and `/webhooks/sim` produce):

```json
{
  "id": 92704,
  "gateway": "MB",
  "transactionDate": "2026-11-27 15:20:00",
  "accountNumber": "1017588888",
  "code": "DH8F3K2A",
  "content": "DH8F3K2A chuyen tien",
  "transferType": "in",
  "transferAmount": 250000,
  "referenceCode": "FT24012345678",
  "description": ""
}
```

- `externalId` = `id` (fallback `referenceCode`)
- Shop resolved from `accountNumber` → `shops.bank_account_number`
- If `code` is empty, `DH…` is extracted from `content`

## Hard fraud rules (`fraud_checks`)

| Rule | Level | Effect |
|---|---|---|
| `invalid_signature` / bad API key | HIGH | 403, handler never runs, metadata only |
| `blocked_sender` | HIGH | PSID is in the shop's `blocklist` |
| `wrong_receiving_account` | HIGH | `accountNumber` ≠ the shop's `bank_account_number` |
| `outgoing_transfer` | HIGH | `transferType = "out"` |
| `reused_payment_code` | HIGH | that payment code was already reconciled |
| `passed` | LOW | nothing triggered (one row per event, for the audit trail) |

## Endpoints

| Endpoint | Auth | Notes |
|---|---|---|
| `GET/POST /webhooks/messenger` | `X-Hub-Signature-256` (FB_APP_SECRET) | raw body before JSON |
| `POST /webhooks/sepay` | `Authorization: Apikey <SEPAY_WEBHOOK_API_KEY>` | answers `{ success: true }` |
| `POST /webhooks/sim` | `X-Sim-Signature: sha256=<hex>` (SIM_WEBHOOK_SECRET) | same handlers as the real ones |
| `POST /api/dev/simulate-payment` | shop JWT | `{ orderId }` → builds a SePay payload |

## Registering a handler

```js
// e.g. from services/payments/payment.service.js
import { onEvent } from '../webhook/webhook.service.js'

const off = onEvent('payment.received', async ({ eventId, shopId, payload }) => {
  // reconcile the payment (payment.service, M4)
})
```

The returned function unregisters the handler. All handlers of one event run with
`Promise.allSettled`: if any fails the event is marked `FAILED`, but the others still ran.
