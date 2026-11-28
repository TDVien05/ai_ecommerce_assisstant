# Payment reconciliation (SePay → order)

Prep notes for F5.3 / F5.4. Source of truth: [PAYMENT_ANTI_SCAM.md](PAYMENT_ANTI_SCAM.md).
Reconciliation runs inside the `payment.received` handler registered on the webhook pipe
(`services/webhook.service.js`), never in the route.

## Rules, in order

1. **Signature already checked** — the route rejects a bad API key before anything is parsed.
2. **Store once** — `payment_transactions.sepay_id UNIQUE`. A provider retry returns 200 and
   does nothing else.
3. **Only money in** — `transferType === "in"`; anything else is `IGNORED` and never touches an order.
4. **Correct shop** — `accountNumber` must equal that shop's `bank_account_number`. A mismatch
   is a HIGH fraud finding (already implemented in `services/fraud.service.js`).
5. **Find the order** — by `code`, falling back to `DH…` extracted from `content`. Not found →
   `match_status = NO_ORDER`, a `todos` row for the shop owner, no order change.
6. **Order must be `AWAITING_PAYMENT`** — an already-paid order receiving more money is never
   marked twice; it becomes a `todos` row for the owner.
7. **Not expired** — `expires_at` in the past means the money is late: no automatic `PAID`,
   a `todos` row so the owner can decide.
8. **Exact amount** — `transferAmount >= orders.total` → proceed; short → `UNDERPAID` + a
   `todos` row asking the customer to send the rest.
9. **One transaction** — order → `PAID`, `paid_at = now()`, `ledger_entries` INCOME/SALES with
   `dedupe_key = sepay:<sepay_id>`, stock decremented per `order_items`.
10. **`match_status = MATCHED`**, `payment_transactions.order_id` set.
11. Notify the customer on Messenger and the shop owner on the dashboard (later milestone).

## What must be idempotent

| Retry | Expected |
|---|---|
| Same `sepay_id` twice | second request does nothing, order stays PAID |
| Same `code`, different `sepay_id`, order already PAID | no second ledger row, `todos` row for the owner |
| Crash after COMMIT, before the reply | SePay retries, dedupe by `sepay_id` handles it |
| Crash before COMMIT | nothing written, retry reconciles normally |

## Tests to write (F5.3 / F5.4)

`server/test/payment.reconcile.test.js` already holds the `todo` cases:
exact amount, underpay, overpay, expired order, duplicate `sepay_id`, unknown code.

## Open questions for Duy (19:00 meeting)

1. **Overpayment**: mark `PAID` and open a `todos` row for the refund, or hold the order until
   the owner decides?
2. **Expired order that gets paid**: auto-revive to `PAID`, or keep `EXPIRED` and refund manually?
3. **Split payments** (customer transfers the total in two transactions): allowed, or must be
   one transfer? If allowed, `PAID` only when the sum of matched transactions reaches `total`.
4. **Second payment on a PAID order**: refund flow, or wallet credit? Which `ledger_entries`
   category should that use?
5. **`orders.risk_level`**: does a HIGH fraud finding on the payment set the order to HIGH, or
   does it stay a fraud-only signal?
6. **`todos` wording/ownership**: should the server create the `todos` row (my preference,
   `services/payment.service.js`) or should the client derive them from `match_status`?
