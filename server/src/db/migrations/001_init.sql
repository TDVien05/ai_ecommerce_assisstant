-- Initial schema. See docs/DATABASE.md. Money columns are BIGINT VND.
-- gen_random_uuid() is built in from PostgreSQL 13.

CREATE TABLE shops (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text NOT NULL,
  fb_page_id          text UNIQUE,
  fb_page_token       text,            -- encrypted at rest
  bank_code           text,
  bank_account_number text,
  bank_account_name   text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE products (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id     uuid NOT NULL REFERENCES shops(id),
  sku         text,
  name        text NOT NULL,
  description text,
  price       bigint NOT NULL CHECK (price >= 0),
  cost        bigint NOT NULL DEFAULT 0 CHECK (cost >= 0),
  stock       integer NOT NULL DEFAULT 0,
  variants    jsonb NOT NULL DEFAULT '{}'::jsonb,
  image_url   text,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE customers (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id    uuid NOT NULL REFERENCES shops(id),
  psid       text NOT NULL,
  name       text,
  phone      text,
  address    text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shop_id, psid)
);

CREATE TABLE conversations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id     uuid NOT NULL REFERENCES shops(id),
  customer_id uuid NOT NULL UNIQUE REFERENCES customers(id),  -- 1 conversation / customer
  ai_paused   boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id),
  mid             text UNIQUE,  -- Meta message id, dedupe; NULL for assistant/tool rows
  role            text NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
  content         text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE orders (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id          uuid NOT NULL REFERENCES shops(id),
  customer_id      uuid NOT NULL REFERENCES customers(id),
  payment_code     text NOT NULL UNIQUE,
  status           text NOT NULL DEFAULT 'AWAITING_PAYMENT'
                   CHECK (status IN ('AWAITING_PAYMENT', 'PAID', 'EXPIRED', 'CANCELLED',
                                     'SHIPPING', 'COMPLETED', 'REFUNDED')),
  subtotal         bigint NOT NULL CHECK (subtotal >= 0),
  shipping_fee     bigint NOT NULL DEFAULT 0 CHECK (shipping_fee >= 0),
  total            bigint NOT NULL CHECK (total >= 0),
  shipping_name    text,
  shipping_phone   text,
  shipping_address text,
  expires_at       timestamptz,
  paid_at          timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE order_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id    uuid REFERENCES products(id),
  name_snapshot text NOT NULL,
  variant       jsonb NOT NULL DEFAULT '{}'::jsonb,
  unit_price    bigint NOT NULL CHECK (unit_price >= 0),
  unit_cost     bigint NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  quantity      integer NOT NULL CHECK (quantity > 0)
);

CREATE TABLE payment_transactions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sepay_id         bigint NOT NULL UNIQUE,  -- dedupe SePay retries
  gateway          text,
  account_number   text,
  code             text,
  content          text,
  reference_code   text,
  transfer_type    text CHECK (transfer_type IN ('in', 'out')),
  transfer_amount  bigint NOT NULL,
  transaction_date timestamptz,
  order_id         uuid REFERENCES orders(id),
  match_status     text CHECK (match_status IN ('MATCHED', 'UNDERPAID', 'NO_ORDER', 'IGNORED')),
  raw              jsonb NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ledger_entries (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id     uuid NOT NULL REFERENCES shops(id),
  type        text NOT NULL CHECK (type IN ('INCOME', 'EXPENSE')),
  category    text NOT NULL CHECK (category IN ('SALES', 'SHIPPING', 'ADS', 'INVENTORY', 'OTHER')),
  amount      bigint NOT NULL CHECK (amount >= 0),
  order_id    uuid REFERENCES orders(id),
  note        text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX orders_shop_status_created_idx ON orders (shop_id, status, created_at);
CREATE INDEX ledger_entries_shop_occurred_idx ON ledger_entries (shop_id, occurred_at);
CREATE INDEX messages_conversation_created_idx ON messages (conversation_id, created_at);
