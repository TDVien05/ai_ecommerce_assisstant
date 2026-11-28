-- Older rows do not carry reliable classification, channel or manual-origin data.
ALTER TABLE ledger_entries
  ADD COLUMN kind text CHECK (kind IN ('BUSINESS_REVENUE', 'PERSONAL', 'EXPENSE', 'TRANSFER')),
  ADD COLUMN channel text CHECK (channel IN ('CASH', 'BANK', 'EWALLET')),
  ADD COLUMN document_ref text,
  ADD COLUMN document_date date,
  ADD COLUMN industry text,
  ADD COLUMN manual boolean;

-- Conservatively deny manual-only deletion for legacy rows of unknown origin.
UPDATE ledger_entries SET manual = false WHERE manual IS NULL;

ALTER TABLE ledger_entries ALTER COLUMN manual SET DEFAULT true;
ALTER TABLE ledger_entries ALTER COLUMN manual SET NOT NULL;
