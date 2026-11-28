import { randomUUID, createHash } from 'node:crypto'
import { logger } from '../../lib/logger.js'
import { withTransaction } from '../../db/pool.js'
import { HttpError } from '../../lib/httpError.js'
import * as threads from '../../db/assistant/threads.js'
import * as store from './store.js'
import * as events from './events.js'
import { formatTime } from './view.js'
import { getFile } from './files.js'
import { parseStatementCsv, classifyRows } from './statement.js'
import { makeStep } from './steps.js'

const title='Nhập sao kê', scope='Kiểm tra và phân loại giao dịch trong tệp CSV.'
function threadView(row) { return {id:row.id,title:row.title,status:row.status,scope:row.scope,updatedAt:formatTime(row.updated_at)} }
function summary(row,detail) {
  return {id:`summary-${row.id}`,role:'assistant',blocks:[{type:'threadSummary',threadId:row.id,title:row.title,status:row.status === 'running' ? 'waiting' : row.status,updatedAt:formatTime(row.updated_at),summary:detail}]}
}
export async function updateThread(shopId,id,status,detail,client) {
  if (!await threads.getThread(shopId,id,client,true)) return null
  const row=await threads.setThread(shopId,id,status,client)
  const message=summary(row,detail)
  await threads.setSummary(shopId,message.id,message,client)
  return {thread:threadView(row),message}
}
export function publishUpdate(shopId,update) {
  if (!update) return
  events.publish(shopId,{type:'thread',thread:update.thread})
  events.publish(shopId,{type:'message',conversationId:'hub',message:update.message})
}
export async function startStatement(auth,{text,attachments}) {
  if (attachments.length!==1) throw new HttpError(400,'INVALID_FILE','Mỗi lần chỉ nhập một tệp CSV.')
  const file=await getFile(auth.shopId,attachments[0].fileId)
  if (file.name!==attachments[0].name) throw new HttpError(404,'FILE_NOT_FOUND','Không tìm thấy tệp sao kê.')
  const id=randomUUID(), hubUser={id:randomUUID(),role:'user',text,files:[file.name],attachmentIds:[file.id],threadId:id}
  const digest=createHash('sha256').update(file.content).digest('hex')
  const threadUser={id:randomUUID(),role:'user',text,files:[file.name]}
  const created=await withTransaction(async (client) => {
    await threads.lockFileImport(auth.shopId,digest,client)
    const previous=await threads.activeFileImport(auth.shopId,file.content,client)
    if (previous) {
      const state=previous.state==='done' ? 'đã duyệt' : previous.status==='waiting' ? 'chờ duyệt' : 'đang xử lý'
      throw new HttpError(409,'DUPLICATE_FILE',`Tệp này ${state}. Hãy mở luồng ${previous.id} để xem.`,{threadId:previous.id,state})
    }
    await threads.createThread(auth.shopId,{id,title,status:'running',scope},client)
    await store.insertMessage(auth.shopId,'hub',hubUser,client)
    await store.insertMessage(auth.shopId,id,threadUser,client)
    const row=await threads.getThread(auth.shopId,id,client)
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
      const {rows,warnings}=parseStatementCsv(file.content)
      const classifications=await classifyRows(rows,{shopId:auth.shopId,userId:auth.userId,runId:randomUUID()})
      const entries=rows.map((row) => { const item=classifications.find((value)=>value.index===row.index); return {type:row.amount>0?'INCOME':'EXPENSE',kind:item.kind,channel:'BANK',category:item.category,amount:Math.abs(row.amount),occurredAt:new Date(`${row.date}T12:00:00+07:00`).toISOString(),note:row.description,documentRef:row.reference,documentDate:null,industry:null} })
      const actions=[]; for(let i=0;i<entries.length;i+=20) actions.push({tool:'add_ledger_entries',input:{entries:entries.slice(i,i+20)}})
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
