-- SRS 2.1: agent run log, change log (undo), webhook intake, fraud checks,
-- blocklist, todos, pins, labels, AI usage. Also extends the existing tables for the
-- new order lifecycle, ledger sources and demo shops.
-- Everything that belongs to a shop is deleted with it (ON DELETE CASCADE).

-- ---------------------------------------------------------------- shops (demo)

ALTER TABLE shops ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS demo_expires_at timestamptz;

CREATE INDEX IF NOT EXISTS shops_demo_expires_idx ON shops (demo_expires_at) WHERE is_demo;

-- ---------------------------------------------------------------- orders

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ALTER COLUMN status SET DEFAULT 'AWAITING_PAYMENT';
-- Keep the lifecycle names the dashboard and assistant already use (SHIPPING, COMPLETED)
-- and add the SRS 2.1 states on top, so both naming schemes stay valid.
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('AWAITING_PAYMENT', 'PAID', 'EXPIRED', 'CANCELLED', 'SHIPPING', 'COMPLETED',
                    'SHIPPED', 'LIKELY_DELIVERED', 'DELIVERED', 'FOLLOWED_UP', 'REFUNDED'));

ALTER TABLE orders ADD COLUMN IF NOT EXISTS risk_level text NOT NULL DEFAULT 'LOW'
  CHECK (risk_level IN ('LOW', 'MEDIUM', 'HIGH'));

CREATE INDEX IF NOT EXISTS orders_shop_status_created_idx ON orders (shop_id, status, created_at);

-- ---------------------------------------------------------------- labels

CREATE TABLE labels (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id    uuid NOT NULL REFERENCES shops(id),
  name       text NOT NULL,
  color      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shop_id, name)
);

-- ---------------------------------------------------------------- agent runs

CREATE TABLE agent_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id         uuid NOT NULL REFERENCES shops(id),
  user_id         uuid REFERENCES users(id),
  conversation_id uuid REFERENCES conversations(id),
  command         text NOT NULL,
  status          text NOT NULL DEFAULT 'RUNNING'
                  CHECK (status IN ('RUNNING', 'AWAITING_INPUT', 'AWAITING_APPROVAL',
                                    'DONE', 'CANCELLED', 'FAILED', 'UNDONE')),
  plan            jsonb,
  result          jsonb,
  error           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  finished_at     timestamptz
);

CREATE INDEX agent_runs_shop_created_idx ON agent_runs (shop_id, created_at DESC);

CREATE TABLE agent_run_events (
  id         bigserial PRIMARY KEY,
  run_id     uuid NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  seq        integer NOT NULL,
  type       text NOT NULL,
  payload    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, seq)
);

-- ---------------------------------------------------------------- change log (undo)

CREATE TABLE changes (
  id         bigserial PRIMARY KEY,
  shop_id    uuid NOT NULL REFERENCES shops(id),
  run_id     uuid NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  entity     text NOT NULL,             -- orders | ledger_entries | products | todos ...
  entity_id  text NOT NULL,
  action     text NOT NULL CHECK (action IN ('insert', 'update', 'delete')),
  before     jsonb,
  after      jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX changes_run_idx ON changes (run_id, id DESC);
CREATE INDEX changes_shop_created_idx ON changes (shop_id, created_at DESC);

-- ---------------------------------------------------------------- ledger extras

ALTER TABLE ledger_entries ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';
ALTER TABLE ledger_entries ADD COLUMN IF NOT EXISTS label_id uuid REFERENCES labels(id) ON DELETE SET NULL;
ALTER TABLE ledger_entries ADD COLUMN IF NOT EXISTS counterparty text;
ALTER TABLE ledger_entries ADD COLUMN IF NOT EXISTS raw_description text;
ALTER TABLE ledger_entries ADD COLUMN IF NOT EXISTS dedupe_key text;
ALTER TABLE ledger_entries ADD COLUMN IF NOT EXISTS run_id uuid REFERENCES agent_runs(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ledger_entries_shop_dedupe_idx
  ON ledger_entries (shop_id, dedupe_key) WHERE dedupe_key IS NOT NULL;

-- ---------------------------------------------------------------- payment transactions

-- Scope transactions to a shop so they are removed with a demo shop.
ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS shop_id uuid REFERENCES shops(id);
UPDATE payment_transactions pt SET shop_id = o.shop_id FROM orders o
  WHERE pt.order_id = o.id AND pt.shop_id IS NULL;
CREATE INDEX IF NOT EXISTS payment_transactions_shop_created_idx
  ON payment_transactions (shop_id, created_at DESC);

-- ---------------------------------------------------------------- webhook intake

CREATE TABLE webhook_events (
  id           bigserial PRIMARY KEY,
  provider     text NOT NULL CHECK (provider IN ('messenger', 'sepay', 'sim')),
  external_id  text NOT NULL,
  type         text NOT NULL,
  shop_id      uuid REFERENCES shops(id) ON DELETE SET NULL,
  payload      jsonb NOT NULL,
  status       text NOT NULL DEFAULT 'RECEIVED'
               CHECK (status IN ('RECEIVED', 'PROCESSED', 'IGNORED', 'FAILED')),
  error        text,
  received_at  timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE (provider, external_id)
);

CREATE INDEX webhook_events_status_idx ON webhook_events (status, received_at);

-- ---------------------------------------------------------------- fraud checks

CREATE TABLE fraud_checks (
  id          bigserial PRIMARY KEY,
  shop_id     uuid REFERENCES shops(id) ON DELETE CASCADE,
  provider    text,
  external_id text,
  level       text NOT NULL CHECK (level IN ('LOW', 'MEDIUM', 'HIGH')),
  rule        text NOT NULL,
  reason      text,
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX fraud_checks_shop_created_idx ON fraud_checks (shop_id, created_at DESC);
CREATE INDEX fraud_checks_level_idx ON fraud_checks (level, created_at DESC);

-- ---------------------------------------------------------------- blocklist

CREATE TABLE blocklist (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id    uuid NOT NULL REFERENCES shops(id),
  kind       text NOT NULL CHECK (kind IN ('PSID', 'PHONE', 'BANK_ACCOUNT')),
  value      text NOT NULL,
  reason     text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shop_id, kind, value)
);

-- ---------------------------------------------------------------- todos

CREATE TABLE todos (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id    uuid NOT NULL REFERENCES shops(id),
  title      text NOT NULL,
  detail     text,
  status     text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'DONE', 'DISMISSED')),
  due_at     timestamptz,
  order_id   uuid REFERENCES orders(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX todos_shop_status_idx ON todos (shop_id, status, created_at DESC);

-- ---------------------------------------------------------------- pins

CREATE TABLE pins (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id    uuid NOT NULL REFERENCES shops(id),
  kind       text NOT NULL,
  ref_id     text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shop_id, kind, ref_id)
);

-- ---------------------------------------------------------------- AI usage

CREATE TABLE ai_usage (
  id                bigserial PRIMARY KEY,
  shop_id           uuid REFERENCES shops(id) ON DELETE CASCADE,
  role              text,
  model             text,
  prompt_tokens     integer NOT NULL DEFAULT 0,
  completion_tokens integer NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ai_usage_shop_created_idx ON ai_usage (shop_id, created_at DESC);

-- ---------------------------------------------------------------- cascade from shops

DO $$
DECLARE
  fk record;
BEGIN
  FOR fk IN
    SELECT c.conname, t.relname AS table_name
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.contype = 'f'
      AND c.confrelid = 'shops'::regclass
      AND t.relname <> 'webhook_events'
  LOOP
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', fk.table_name, fk.conname);
    EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE',
                   fk.table_name, fk.conname);
  END LOOP;
END $$;

-- customers and everything below them follow the shop as well.
ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_customer_id_fkey;
ALTER TABLE conversations ADD CONSTRAINT conversations_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_customer_id_fkey;
ALTER TABLE orders ADD CONSTRAINT orders_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;

ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_conversation_id_fkey;
ALTER TABLE messages ADD CONSTRAINT messages_conversation_id_fkey
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;

-- Order lines keep the name/price snapshot, so a deleted product only clears the reference.
ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_product_id_fkey;
ALTER TABLE order_items ADD CONSTRAINT order_items_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;

ALTER TABLE ledger_entries DROP CONSTRAINT IF EXISTS ledger_entries_order_id_fkey;
ALTER TABLE ledger_entries ADD CONSTRAINT ledger_entries_order_id_fkey
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL;

ALTER TABLE payment_transactions DROP CONSTRAINT IF EXISTS payment_transactions_order_id_fkey;
ALTER TABLE payment_transactions ADD CONSTRAINT payment_transactions_order_id_fkey
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL;
