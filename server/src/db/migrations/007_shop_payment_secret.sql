-- Per-shop payment credentials. A shop connects its own SePay (or compatible) account and
-- registers the webhook secret here. The value is stored ENCRYPTED (AES-256-GCM, see
-- lib/secrets.js); the column holds the ciphertext envelope, never the plaintext secret.
--
-- Why per-shop: SePay is a per-business gateway. Each shop signs its own webhook with its own
-- secret, so one server process must verify with the secret of the shop in the URL.

ALTER TABLE shops ADD COLUMN IF NOT EXISTS sepay_webhook_secret text;

-- A shop can also use a different gateway than SePay; the label is informational only.
ALTER TABLE shops ADD COLUMN IF NOT EXISTS payment_provider text;

-- Look up a shop by its receiving account during webhook reconciliation. Non-unique on purpose:
-- legacy rows may share an account before they are cleaned up.
CREATE INDEX IF NOT EXISTS shops_bank_account_idx ON shops (bank_account_number)
  WHERE bank_account_number IS NOT NULL;
