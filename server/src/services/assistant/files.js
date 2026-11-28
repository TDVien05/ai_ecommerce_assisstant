import { z } from 'zod'
import { appError } from '../../errors/index.js'
import * as fileRepo from '../../repositories/assistant/assistantFile.repository.js'
import { parseStatementXlsx } from './statement-xlsx.js'
import { maskStatementText } from './statement.js'
const bad = (message) => appError('INVALID_FILE', message)
export async function uploadFile(shopId,file) {
  if (!file || !Buffer.isBuffer(file.buffer) || !file.buffer.length || file.buffer.length > 2097152) throw bad('Chọn một tệp CSV hoặc XLSX không rỗng, tối đa 2 MB.')
  const name = file.originalname?.normalize('NFC')
  if (!z.string().min(1).max(255).regex(/^[^/\\\x00-\x1f]+\.(?:csv|xlsx)$/i).safeParse(name).success) throw bad('Chỉ nhận tệp .csv hoặc .xlsx.')
  const xlsx=/\.xlsx$/i.test(name)
  if(xlsx) await parseStatementXlsx(file.buffer)
  else try { const text = new TextDecoder('utf-8',{fatal:true}).decode(file.buffer); if (text.includes('\0')) throw new Error('null') } catch { throw bad('Tệp CSV phải mã hóa UTF-8.') }
  const saved = await fileRepo.saveFile(shopId,maskStatementText(name),file.buffer,undefined,xlsx?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'text/csv')
  return {fileId:saved.id,name:saved.name}
}
export async function getFile(shopId,id) { const file=await fileRepo.getFile(shopId,id); if (!file) throw appError('FILE_NOT_FOUND', 'Không tìm thấy tệp sao kê.'); return file }
