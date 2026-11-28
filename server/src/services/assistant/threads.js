import { randomUUID, createHash } from 'node:crypto'
import { logger } from '../../lib/logger.js'
import { withTransaction } from '../../repositories/database.js'
import { appError, HttpError } from '../../errors/index.js'
import * as threadRepo from '../../repositories/assistant/assistantThread.repository.js'
import * as fileRepo from '../../repositories/assistant/assistantFile.repository.js'
import * as store from './store.js'
import * as events from './events.js'
import { getFile } from './files.js'
import { classifyRows } from './statement.js'
import { readStatement } from './statement-io.js'
import { makeStep } from './steps.js'
import { redactOwnerText } from '../../lib/sensitiveText.js'
import * as statementHistory from '../../repositories/assistant/statementHistory.js'
import { threadView, summary, updateThread, publishUpdate } from './thread-status.js'
export { updateThread, publishUpdate } from './thread-status.js'

const title='Nhập sao kê', scope='Kiểm tra và phân loại giao dịch trong tệp CSV hoặc XLSX.'
export async function startStatement(auth,{text,attachments}) {
  if (attachments.length!==1) throw appError('INVALID_FILE', 'Mỗi lần chỉ nhập một tệp CSV hoặc XLSX.')
  const file=await getFile(auth.shopId,attachments[0].fileId)
  if (file.name!==attachments[0].name) throw appError('FILE_NOT_FOUND', 'Không tìm thấy tệp sao kê.')
  const safeText=redactOwnerText(text)
  const id=randomUUID(), hubUser={id:randomUUID(),role:'user',text:safeText,files:[file.name],attachmentIds:[file.id],threadId:id}
  const digest=createHash('sha256').update(file.content).digest('hex')
  const threadUser={id:randomUUID(),role:'user',text:safeText,files:[file.name]}
  const created=await withTransaction(async (client) => {
    await fileRepo.lockFileImport(auth.shopId,digest,client)
    const previous=await fileRepo.activeFileImport(auth.shopId,file.content,client)
    if (previous) {
      const state=previous.state==='done' ? 'đã duyệt' : previous.status==='waiting' ? 'chờ duyệt' : 'đang xử lý'
      throw appError('DUPLICATE_FILE', `Tệp này ${state}. Hãy mở luồng ${previous.id} để xem.`, { details: {threadId:previous.id,state} })
    }
    const other=await statementHistory.activeMarker(auth.shopId,digest,client,null,true)
    if(other)throw appError('DUPLICATE_FILE','Tệp này đã có đề xuất nhập. Hãy kiểm tra lịch sử sao kê.')
    await threadRepo.createThread(auth.shopId,{id,title,status:'running',scope},client)
    await store.insertMessage(auth.shopId,'hub',hubUser,client)
    await store.insertMessage(auth.shopId,id,threadUser,client)
    const row=await threadRepo.getThread(auth.shopId,id,client)
    const msg=summary(row,'Đang đọc sao kê; mở luồng để theo dõi.')
    await store.insertMessage(auth.shopId,'hub',msg,client)
    return {row,msg}
  })
  events.acquire(auth.shopId,id)
  events.publish(auth.shopId,{type:'message',conversationId:'hub',message:hubUser})
  events.publish(auth.shopId,{type:'thread',thread:threadView(created.row)})
  events.publish(auth.shopId,{type:'message',conversationId:'hub',message:created.msg})
  events.publish(auth.shopId,{type:'message',conversationId:id,message:threadUser})
  events.publish(auth.shopId,{type:'typing',conversationId:id,value:true})
  setImmediate(async () => {
    try {
      const ctx={shopId:auth.shopId,userId:auth.userId,runId:randomUUID()}
      const {rows,warnings}=await readStatement(auth.shopId,file.id,ctx)
      const classifications=await classifyRows(rows,ctx)
      const entries=rows.map((row) => { const item=classifications.find((value)=>value.index===row.index); return {type:row.amount>0?'INCOME':'EXPENSE',kind:item.kind,channel:'BANK',category:item.category,amount:Math.abs(row.amount),occurredAt:new Date(`${row.date}T12:00:00+07:00`).toISOString(),note:row.description,documentRef:row.reference,documentDate:null,industry:null} })
      const actions=[{tool:'statement_marker',input:{fileId:file.id,digest,name:file.name}}]; for(let i=0;i<entries.length;i+=20) actions.push({tool:'add_ledger_entries',input:{entries:entries.slice(i,i+20)}})
      const view=makeStep(actions)
      const reply={id:randomUUID(),role:'assistant',blocks:[{type:'text',text:warnings.length ? `Mình đọc được ${rows.length} dòng; ${warnings.length} dòng không hợp lệ. ${warnings.join(' ')}` : `Mình đã đọc ${rows.length} dòng. Bạn kiểm tra trước khi duyệt.`},view]}
      const update=await withTransaction(async (client) => {
        await store.insertMessage(auth.shopId,id,reply,client)
        await store.createStep(auth.shopId,id,reply.id,{view,actions},client)
        return updateThread(auth.shopId,id,'waiting','Sao kê đã đọc xong, chờ bạn kiểm tra và duyệt.',client)
      })
      events.publish(auth.shopId,{type:'message',conversationId:id,message:reply}); publishUpdate(auth.shopId,update)
    } catch (error) {
      try {
        const message=error instanceof HttpError ? error.message : 'Không đọc được sao kê. Bạn kiểm tra tệp rồi thử lại.'
        const reply={id:randomUUID(),role:'assistant',blocks:[{type:'text',text:message}]}
        const update=await withTransaction(async (client) => { await store.insertMessage(auth.shopId,id,reply,client); return updateThread(auth.shopId,id,'done','Không đọc được sao kê; mở luồng để xem chi tiết.',client) })
        events.publish(auth.shopId,{type:'message',conversationId:id,message:reply}); publishUpdate(auth.shopId,update)
      } catch (saveError) { logger.error({code:saveError?.code},'Không lưu được lỗi xử lý sao kê') }
    } finally { events.release(auth.shopId,id); events.publish(auth.shopId,{type:'typing',conversationId:id,value:false}) }
  })
}
