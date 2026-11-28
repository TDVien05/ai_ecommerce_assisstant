# Payment verification and anti-scam

## Core principle
**The only source of truth is SePay's balance-change webhook.** Screenshots, "I've paid" messages or receipts sent by the customer are **never** used to confirm an order, because that is the most common scam (fake or edited receipts).

## Payment code generation
- Each order has a unique `payment_code`: a fixed prefix + a random string, e.g. `DH8F3K2A` (excluding easily confused characters such as `0/O`, `1/I`).
- Configure the same prefix in SePay (*Cấu trúc mã thanh toán* / payment code structure). With the "only send when a payment code is present" option enabled, SePay only fires the webhook for transactions that contain a code.
- Send the customer a VietQR image with the amount + transfer note prefilled, so they don't have to type it by hand and get it wrong.

## Payment window

An order gets a payment code and a **30-minute** deadline (`lib/payment.js`). Every minute a sweep
(`services/orders/expiry.service.js`) flips `AWAITING_PAYMENT` orders past `expires_at` to `EXPIRED`
and releases their stock. The flip is a compare-and-set on `AWAITING_PAYMENT`, so it can never
overwrite a payment that landed in the same second.

**Expiry never hides money.** A transfer that arrives after the deadline is still recorded and
still leaves a `todos` row; the order is simply not marked PAID automatically. Same for an
underpayment, an overpayment and a payment on an already-paid order — see
`services/payments/reconcile.service.js`.

## Checklist for handling `POST /webhooks/sepay`

1. **Authenticate:** HMAC-SHA256, using the secret of the shop in the URL (`POST /webhooks/sepay/:shopId`). SePay signs `{timestamp}.{raw_body}`; header `X-SePay-Signature: sha256=<hex>` + `X-SePay-Timestamp`; reject when the timestamp is off by more than ±5 minutes. Each shop stores its own secret encrypted (AES-256-GCM, `lib/secrets.js`), set via `PUT /api/shop/payment`. The legacy `/webhooks/sepay` route keeps using the global secret or API key for single-shop installs. See `server/src/middlewares/verifySepaySignature.js`.
2. **Store the raw payload** in `payment_transactions` with `sepay_id UNIQUE`. If it already exists (SePay retry) → return `200`, don't process it again.
3. **Only process** `transferType === "in"`.
4. **Correct account:** `accountNumber` must equal `shops.bank_account_number`.
5. **Find the order:** by `code`; if `code` is null, regex-match `payment_code` in `content`. Not found → `match_status = NO_ORDER` (for the shop owner to assign manually).
6. **The order must be `AWAITING_PAYMENT`.** If an already `PAID` order receives more money → flag it for the shop owner to check.
7. **Correct amount:** `transferAmount >= orders.total`. Short → `UNDERPAID`, message the customer to transfer the remainder.
8. In **one DB transaction**: order → `PAID` (compare-and-set + `paid_at = now()`), write the INCOME `ledger_entries` row (`kind = BUSINESS_REVENUE`, `dedupe_key = sepay:<id>`), decrement stock.
9. Send the customer a confirmation message on Messenger. Notify the shop owner on the dashboard.
10. Return `200 { success: true }`.

Implemented in `services/payments/reconcile.service.js`; the handler is registered on
`payment.received` in `app.js` `startServer()`.

| Outcome | When | Order | Also does |
|---|---|---|---|
| `PAID` | open order, amount >= total | → PAID | ledger INCOME, stock −qty |
| `UNDERPAID` | open order, amount < total | unchanged | todo: "chuyển thiếu X ₫" |
| `LATE_PAYMENT` | order already EXPIRED/CANCELLED | unchanged | todo: money arrived, handle by hand |
| `ALREADY_PAID` | order already PAID | unchanged | todo: refund the extra |
| `NO_ORDER` | code matches no order | — | todo: unmatched transfer |
| `IGNORED` | `out` transfer / wrong account | unchanged | todo: explain why |
| `DUPLICATE` | same `sepay_id` again | unchanged | nothing (idempotent) |

## Extra assurance (optional)
- Call SePay's transactions API to cross-check `referenceCode` before confirming high-value orders.
- Orders past `expires_at` (e.g. 30 minutes) without payment → `EXPIRED`, release reserved stock.
- Alert the shop owner when a single PSID creates many orders without paying.

## Testing with SePay Test mode
SePay has a Test mode that simulates transactions without moving real money. Use it to test: exact amount match, underpayment, wrong code, duplicate `id`.

## References
- Payload and API Key authentication: https://developer.sepay.vn/en/sepay-webhooks/tich-hop-webhook
- Security checklist (amount, account number, payment code): https://developer.sepay.vn/en/sepay-webhooks/bao-mat
- The "only send when a payment code is present" option: https://developer.sepay.vn/en/sepay-webhooks/tao-webhook
- Deduplication with `sepay_id UNIQUE`, BIGINT for money: https://developer.sepay.vn/vi/sepay-webhooks/lap-trinh-webhook
- Test mode: https://developer.sepay.vn/en/sepay-webhooks/test-mode/bat-dau-nhanh
