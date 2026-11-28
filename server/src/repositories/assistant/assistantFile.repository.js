// All queries for the `assistant_files` table. See docs/ARCHITECTURE.md, section "Repositories".
import { query } from '../../config/database.js'

export async function saveFile(shopId,name,content,client) { const {rows}=await query("INSERT INTO assistant_files (shop_id,name,mime,size,content) VALUES ($1,$2,'text/csv',$3,$4) RETURNING id,name",[shopId,name,content.length,content], client);return rows[0] }

export async function getFile(shopId,id,client) { const {rows}=await query('SELECT id,name,content FROM assistant_files WHERE shop_id=$1 AND id=$2',[shopId,id], client);return rows[0] ?? null }

export async function attachmentsExist(shopId, attachments) {
  if (!attachments.length) return true
  const ids = [...new Set(attachments.map((file) => file.fileId))]
  const result = await query('SELECT id, name FROM assistant_files WHERE shop_id = $1 AND id = ANY($2::uuid[])', [shopId, ids])
  const found = new Map(result.rows.map((row) => [row.id, row.name]))
  return attachments.every((file) => found.get(file.fileId) === file.name)
}

export async function lockFileImport(shopId,id,client) { await query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`${shopId}:statement:${id}`], client) }

export async function activeFileImport(shopId,content,client) {
  const {rows}=await query(`WITH imports AS (
    SELECT COALESCE(m.body->>'threadId', (SELECT sm.body->'blocks'->0->>'threadId' FROM assistant_messages sm WHERE sm.shop_id=m.shop_id AND sm.conversation_id='hub' AND sm.id LIKE 'summary-%' AND sm.seq>m.seq ORDER BY sm.seq LIMIT 1)) AS thread_id
    FROM assistant_messages m JOIN assistant_files f ON f.shop_id=m.shop_id AND m.body->'attachmentIds' ? f.id::text
    WHERE m.shop_id=$1 AND m.conversation_id='hub' AND f.content=$2
  ) SELECT t.id,t.status,st.state FROM imports i JOIN assistant_threads t ON t.shop_id=$1 AND t.id=i.thread_id
    LEFT JOIN LATERAL (SELECT state FROM assistant_steps WHERE shop_id=$1 AND conversation_id=t.id ORDER BY created_at DESC LIMIT 1) st ON true
    WHERE t.status IN ('running','waiting') OR st.state='done' LIMIT 1`,[shopId,content], client)
  return rows[0] ?? null
}
