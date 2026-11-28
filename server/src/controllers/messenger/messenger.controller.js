import * as gate from '../../services/messenger/gate.service.js'
import { badRequest } from '../../errors/index.js'

/**
 * The shop owner's control over the bot on one conversation.
 * `ai_paused` already exists in the schema and is honoured by gate.service.js; this is the API
 * that lets the dashboard flip it without a SQL statement.
 */
export async function setPaused(req, res) {
  const conversation = await gate.setBotPaused(req.auth.shopId, req.params.id, req.body.aiPaused)
  if (!conversation) throw badRequest('Không tìm thấy hội thoại của cửa hàng này.')
  res.json({ conversation })
}
