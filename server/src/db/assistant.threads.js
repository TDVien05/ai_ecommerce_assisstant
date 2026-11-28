import { pool } from './pool.js'
export async function lockFileImport(shopId,id,client) { await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`${shopId}:statement:${id}`]) }
export async function createThread(shopId,thread,client) {
  await client.query('INSERT INTO assistant_threads (shop_id,id,title,status,scope) VALUES ($1,$2,$3,$4,$5)',[shopId,thread.id,thread.title,thread.status,thread.scope])
}
export async function getThread(shopId,id,client=pool,lock=false) {
  const {rows}=await client.query(`SELECT id,title,status,scope,updated_at FROM assistant_threads WHERE shop_id=$1 AND id=$2${lock ? ' FOR UPDATE' : ''}`,[shopId,id]); return rows[0] ?? null
}
export async function setThread(shopId,id,status,client) {
  const {rows}=await client.query('UPDATE assistant_threads SET status=$3,updated_at=now() WHERE shop_id=$1 AND id=$2 RETURNING id,title,status,scope,updated_at',[shopId,id,status]); return rows[0] ?? null
}
export async function setSummary(shopId,id,message,client) {
  await client.query('UPDATE assistant_messages SET body=$3,updated_at=now() WHERE shop_id=$1 AND id=$2',[shopId,id,message])
}
export async function activeFileImport(shopId,content,client) {
  const {rows}=await client.query(`WITH imports AS (
    SELECT COALESCE(m.body->>'threadId', (SELECT sm.body->'blocks'->0->>'threadId' FROM assistant_messages sm WHERE sm.shop_id=m.shop_id AND sm.conversation_id='hub' AND sm.id LIKE 'summary-%' AND sm.seq>m.seq ORDER BY sm.seq LIMIT 1)) AS thread_id
    FROM assistant_messages m JOIN assistant_files f ON f.shop_id=m.shop_id AND m.body->'attachmentIds' ? f.id::text
    WHERE m.shop_id=$1 AND m.conversation_id='hub' AND f.content=$2
  ) SELECT t.id,t.status,st.state FROM imports i JOIN assistant_threads t ON t.shop_id=$1 AND t.id=i.thread_id
    LEFT JOIN LATERAL (SELECT state FROM assistant_steps WHERE shop_id=$1 AND conversation_id=t.id ORDER BY created_at DESC LIMIT 1) st ON true
    WHERE t.status IN ('running','waiting') OR st.state='done' LIMIT 1`,[shopId,content])
  return rows[0] ?? null
}
