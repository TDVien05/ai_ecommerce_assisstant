-- Owner assistant data is separate from customer Messenger conversations.
CREATE TABLE assistant_threads (
  id         text NOT NULL,
  shop_id    uuid NOT NULL REFERENCES shops(id),
  title      text NOT NULL,
  status     text NOT NULL CHECK (status IN ('alert', 'waiting', 'running', 'done')),
  scope      text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (shop_id, id)
);

-- conversation_id is 'hub' or an assistant thread ID, not a Messenger conversation.
CREATE TABLE assistant_messages (
  shop_id         uuid NOT NULL REFERENCES shops(id),
  id              text NOT NULL,
  conversation_id text NOT NULL,
  role            text NOT NULL CHECK (role IN ('user', 'assistant')),
  body            jsonb NOT NULL,
  seq             bigserial NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (shop_id, id)
);

CREATE TABLE assistant_steps (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id         uuid NOT NULL REFERENCES shops(id),
  conversation_id text NOT NULL,
  message_id      text NOT NULL,
  state           text NOT NULL CHECK (state IN ('working', 'waiting', 'done', 'undone', 'failed')),
  view            jsonb NOT NULL,
  actions         jsonb NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  decided_at      timestamptz,
  UNIQUE (shop_id, id),
  FOREIGN KEY (shop_id, message_id) REFERENCES assistant_messages(shop_id, id)
);

CREATE TABLE assistant_action_log (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id    uuid NOT NULL REFERENCES shops(id),
  step_id    uuid NOT NULL,
  user_id    uuid NOT NULL REFERENCES users(id),
  tool       text NOT NULL,
  before     jsonb,
  after      jsonb,
  applied_at timestamptz NOT NULL DEFAULT now(),
  undone_at  timestamptz,
  FOREIGN KEY (shop_id, step_id) REFERENCES assistant_steps(shop_id, id)
);

CREATE TABLE assistant_files (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id    uuid NOT NULL REFERENCES shops(id),
  name       text NOT NULL,
  mime       text NOT NULL,
  size       integer NOT NULL CHECK (size >= 0 AND size <= 2097152),
  content    bytea NOT NULL CHECK (octet_length(content) = size),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE assistant_alerts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id     uuid NOT NULL REFERENCES shops(id),
  level       text NOT NULL CHECK (level IN ('mid', 'high')),
  title       text NOT NULL,
  reasons     jsonb NOT NULL,
  order_id    uuid REFERENCES orders(id),
  detected_at timestamptz NOT NULL DEFAULT now(),
  status      text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'HELD', 'DISMISSED'))
);

CREATE INDEX assistant_threads_shop_updated_idx ON assistant_threads (shop_id, updated_at);
CREATE INDEX assistant_messages_shop_conversation_seq_idx ON assistant_messages (shop_id, conversation_id, seq);
CREATE INDEX assistant_steps_shop_conversation_idx ON assistant_steps (shop_id, conversation_id, created_at);
CREATE INDEX assistant_action_log_shop_step_idx ON assistant_action_log (shop_id, step_id);
CREATE INDEX assistant_files_shop_created_idx ON assistant_files (shop_id, created_at);
CREATE INDEX assistant_alerts_shop_status_detected_idx ON assistant_alerts (shop_id, status, detected_at);
