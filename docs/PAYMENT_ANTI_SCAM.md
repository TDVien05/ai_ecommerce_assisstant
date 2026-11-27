# Payment verification and anti-scam

## Core principle
**The only source of truth is SePay's balance-change webhook.** Screenshots, "I've paid" messages or receipts sent by the customer are **never** used to confirm an order, because that is the most common scam (fake or edited receipts).

## Payment code generation
- Each order has a unique `payment_code`: a fixed prefix + a random string, e.g. `DH8F3K2A` (excluding easily confused characters such as `0/O`, `1/I`).
- Configure the same prefix in SePay (*Cấu trúc mã thanh toán* / payment code structure). With the "only send when a payment code is present" option enabled, SePay only fires the webhook for transactions that contain a code.
- Send the customer a VietQR image with the amount + transfer note prefilled, so they don't have to type it by hand and get it wrong.

## Checklist for handling `POST /webhooks/sepay`

1. **Authenticate:** the `Authorization` header must equal `Apikey <SEPAY_WEBHOOK_API_KEY>` (compare with `crypto.timingSafeEqual`).
2. **Store the raw payload** in `payment_transactions` with `sepay_id UNIQUE`. If it already exists (SePay retry) → return `200`, don't process it again.
3. **Only process** `transferType === "in"`.
4. **Correct account:** `accountNumber` must equal `shops.bank_account_number`.
5. **Find the order:** by `code`; if `code` is null, regex-match `payment_code` in `content`. Not found → `match_status = NO_ORDER` (for the shop owner to assign manually).
6. **The order must be `AWAITING_PAYMENT`.** If an already `PAID` order receives more money → flag it for the shop owner to check.
7. **Correct amount:** `transferAmount >= orders.total`. Short → `UNDERPAID`, message the customer to transfer the remainder.
8. In **one DB transaction**: order → `PAID`, `paid_at = now()`, write the INCOME `ledger_entries` row, decrement stock.
9. Send the customer a confirmation message on Messenger. Notify the shop owner on the dashboard.
10. Return `200 { success: true }`.

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
