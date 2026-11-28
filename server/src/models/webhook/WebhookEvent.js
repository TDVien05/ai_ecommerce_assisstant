// Table `webhook_events`. Schema source: db/migrations/*.sql.
// Unique per (provider, external_id). Written by services/webhook/webhook.service.js#ingest.
import { defineModel, json, opt, serialPk, text, ts, uuid } from '../../lib/entityColumns.js'

export const WebhookEvent = defineModel('WebhookEvent', 'webhook_events', {
  id:            serialPk(),
  provider:      text(),
  external_id:   text(),
  type:          text(),
  shop_id:       opt(uuid()),
  payload:       json(),
  status:        text(),
  error:         opt(text()),
  received_at:   ts(),
  processed_at:  opt(ts()),
})
