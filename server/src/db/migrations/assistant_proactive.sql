CREATE TABLE assistant_proactive_state (
  shop_id uuid PRIMARY KEY REFERENCES shops(id) ON DELETE CASCADE,
  last_opened_at timestamptz NOT NULL,
  last_scanned_at timestamptz,
  ai_day date,
  ai_calls integer NOT NULL DEFAULT 0 CHECK (ai_calls >= 0),
  revision integer NOT NULL DEFAULT 0
);

-- A demo that only received proactive messages must still expire automatically.
ALTER TABLE assistant_messages DROP CONSTRAINT assistant_messages_shop_id_fkey;
ALTER TABLE assistant_messages ADD FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE;

CREATE INDEX assistant_messages_proactive_active_idx ON assistant_messages (shop_id)
  WHERE conversation_id = 'proactive' AND body->>'status' = 'active';
