// Table `assistant_alerts`. Schema source: db/migrations/*.sql.
// Create alerts through services/alerts/alerts.service.js#createAlert (pg), not here.
import { defineModel, json, opt, text, ts, uuid, uuidPk } from '../../lib/entityColumns.js'

export const AssistantAlert = defineModel('AssistantAlert', 'assistant_alerts', {
  id:           uuidPk(),
  shop_id:      uuid(),
  level:        text(),
  title:        text(),
  reasons:      json(),
  order_id:     opt(uuid()),
  detected_at:  ts(),
  status:       text(),
})
