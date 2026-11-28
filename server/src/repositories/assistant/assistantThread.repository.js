// All queries for the `assistant_threads` table. See docs/ARCHITECTURE.md, section "Repositories".
import { query } from '../../config/database.js'

export async function loadSnapshot(shopId) {
  const shop = await query('SELECT name FROM shops WHERE id = $1', [shopId])
  if (!shop.rowCount) return null
  const threads = await query('SELECT id, title, status, scope, updated_at FROM assistant_threads WHERE shop_id = $1 ORDER BY updated_at, id', [shopId])
  const messages = await query("SELECT conversation_id, body FROM assistant_messages WHERE shop_id = $1 AND conversation_id <> 'proactive' ORDER BY seq", [shopId])
  return { shopName: shop.rows[0].name, threads: threads.rows, messages: messages.rows }
}

export async function conversationExists(shopId, conversationId) {
  if (conversationId === 'hub') return (await query('SELECT 1 FROM shops WHERE id = $1', [shopId])).rowCount > 0
  return (await query('SELECT 1 FROM assistant_threads WHERE shop_id = $1 AND id = $2', [shopId, conversationId])).rowCount > 0
}

export async function createThread(shopId,thread,client) {
  await query('INSERT INTO assistant_threads (shop_id,id,title,status,scope) VALUES ($1,$2,$3,$4,$5)',[shopId,thread.id,thread.title,thread.status,thread.scope], client)
}

export async function getThread(shopId,id,client,lock=false) {
  const {rows}=await query(`SELECT id,title,status,scope,updated_at FROM assistant_threads WHERE shop_id=$1 AND id=$2${lock ? ' FOR UPDATE' : ''}`,[shopId,id], client); return rows[0] ?? null
}

export async function setThread(shopId,id,status,client) {
  const {rows}=await query('UPDATE assistant_threads SET status=$3,updated_at=now() WHERE shop_id=$1 AND id=$2 RETURNING id,title,status,scope,updated_at',[shopId,id,status], client); return rows[0] ?? null
}
