// All queries for the `assistant_messages` table. See docs/ARCHITECTURE.md, section "Repositories".
import { query } from '../../config/database.js'

export async function insertMessage(shopId, conversationId, message, client) {
  await query('INSERT INTO assistant_messages (shop_id, id, conversation_id, role, body) VALUES ($1, $2, $3, $4, $5)', [shopId, message.id, conversationId, message.role, message], client)
}

export async function recentMessages(shopId, conversationId) {
  const { rows } = await query('SELECT body FROM (SELECT seq, body FROM assistant_messages WHERE shop_id = $1 AND conversation_id = $2 ORDER BY seq DESC LIMIT 20) recent ORDER BY seq', [shopId, conversationId])
  return rows.map((row) => row.body)
}

export async function unansweredConversations(client) {
  const { rows } = await query(`SELECT shop_id, conversation_id FROM (
    SELECT DISTINCT ON (shop_id, conversation_id) shop_id, conversation_id, role
    FROM assistant_messages ORDER BY shop_id, conversation_id, seq DESC
  ) latest WHERE role = 'user'`, undefined, client)
  return rows
}

export async function setSummary(shopId,id,message,client) {
  await query('UPDATE assistant_messages SET body=$3,updated_at=now() WHERE shop_id=$1 AND id=$2',[shopId,id,message], client)
}

export async function updateMessage(shopId,id,message,client) { const {rowCount}=await query('UPDATE assistant_messages SET body=$3,updated_at=now() WHERE shop_id=$1 AND id=$2',[shopId,id,message], client); return rowCount>0 }

export async function getMessage(shopId,id,client,lock=false) { const {rows}=await query(`SELECT body FROM assistant_messages WHERE shop_id=$1 AND id=$2${lock?' FOR UPDATE':''}`,[shopId,id], client);return rows[0]?.body??null }
