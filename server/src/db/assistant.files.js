import { pool } from './pool.js'
export async function lockFiles(shopId,client) { await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`${shopId}:assistant-files`]) }
export async function findDuplicate(shopId,content,client) { const {rowCount}=await client.query('SELECT 1 FROM assistant_files WHERE shop_id=$1 AND content=$2 LIMIT 1',[shopId,content]);return rowCount>0 }
export async function saveFile(shopId,name,content,client) { const {rows}=await client.query("INSERT INTO assistant_files (shop_id,name,mime,size,content) VALUES ($1,$2,'text/csv',$3,$4) RETURNING id,name",[shopId,name,content.length,content]);return rows[0] }
export async function getFile(shopId,id,client=pool) { const {rows}=await client.query('SELECT id,name,content FROM assistant_files WHERE shop_id=$1 AND id=$2',[shopId,id]);return rows[0] ?? null }
