import { z } from 'zod'
import { HttpError } from '../../lib/httpError.js'
import * as db from '../../db/assistant/files.js'
const bad = (message) => new HttpError(400,'INVALID_FILE',message)
export async function uploadFile(shopId,file) {
  if (!file || !Buffer.isBuffer(file.buffer) || !file.buffer.length || file.buffer.length > 2097152) throw bad('Chọn một tệp CSV không rỗng, tối đa 2 MB.')
  const name = file.originalname?.normalize('NFC')
  if (!z.string().min(1).max(255).regex(/^[^/\\\x00-\x1f]+\.csv$/i).safeParse(name).success) throw bad('Chỉ nhận tệp có đuôi .csv.')
  try { const text = new TextDecoder('utf-8',{fatal:true}).decode(file.buffer); if (text.includes('\0')) throw new Error('null') } catch { throw bad('Tệp phải là CSV mã hóa UTF-8.') }
  const saved = await db.saveFile(shopId,name,file.buffer)
  return {fileId:saved.id,name:saved.name}
}
export async function getFile(shopId,id) { const file=await db.getFile(shopId,id); if (!file) throw new HttpError(404,'FILE_NOT_FOUND','Không tìm thấy tệp sao kê.'); return file }
