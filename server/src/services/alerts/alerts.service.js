import { createHash } from 'node:crypto'
import { z } from 'zod'
import { withTransaction } from '../../repositories/database.js'
import * as alertRepo from '../../repositories/alerts/assistantAlert.repository.js'
import * as messageRepo from '../../repositories/assistant/assistantMessage.repository.js'
import * as orderRepo from '../../repositories/orders/order.repository.js'
import * as threadRepo from '../../repositories/assistant/assistantThread.repository.js'
import { insertMessage } from '../../repositories/assistant/assistantMessage.repository.js'
import { publish } from '../assistant/events.js'
import { formatTime } from '../assistant/view.js'
import { appError } from '../../errors/index.js'
const inputSchema=z.object({eventKey:z.string().trim().min(1).max(200),level:z.enum(['mid','high']),title:z.string().trim().min(1).max(200),reasons:z.array(z.string().trim().min(1).max(500)).min(1).max(10),orderId:z.string().uuid().nullable().optional()}).strict()
const invalid=()=>appError('BAD_REQUEST', 'Thông tin cảnh báo không hợp lệ.')
const missing=()=>appError('ALERT_NOT_FOUND', 'Không tìm thấy cảnh báo.')
const conflict=()=>appError('ALERT_CLOSED', 'Cảnh báo đã được xử lý.')
const toView=(row)=>({id:row.id,level:row.level,title:row.title,reasons:row.reasons,orderId:row.order_id,orderCode:row.order_code,detectedAt:new Date(row.detected_at).toISOString(),status:row.status})
function alertId(shopId,eventKey) { const h=createHash('sha256').update(JSON.stringify([shopId,eventKey])).digest('hex'); return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}` }
export function publishAlert(shopId,events) { for(const event of events??[]) publish(shopId,event) }
export async function createAlert(shopId,input,{client}={}) {
  const parsed=inputSchema.safeParse(input); if(!parsed.success || !z.string().uuid().safeParse(shopId).success) throw invalid()
  const create=async (dbClient)=>{
    const data=parsed.data, id=alertId(shopId,data.eventKey), threadId=`alert-${id}`
    if(data.orderId && !await orderRepo.exists(shopId,data.orderId,dbClient)) throw missing()
    const created=await alertRepo.insert(shopId,id,data,dbClient)
    const row=await alertRepo.find(shopId,id,dbClient)
    if (!row) throw missing()
    const alert=toView(row); if(!created) return {alert,created:false,events:[]}
    const thread={id:threadId,title:data.title,status:'alert',scope:'Kiểm tra cảnh báo và thông tin liên quan.'}
    await threadRepo.createThread(shopId,thread,dbClient)
    const risk={id:`risk-${id}`,role:'assistant',blocks:[{type:'riskAlert',alertId:id,title:data.title,level:data.level,reasons:data.reasons,safeActionLabel:'Tạm giữ cảnh báo',detectedNote:`Phát hiện lúc ${formatTime(new Date(row.detected_at))}`}]}
    const notice={id:`notice-${id}`,role:'assistant',blocks:[{type:'proactiveNotice',noticeId:id,threadId,headline:data.title,detail:'Có cảnh báo cần bạn kiểm tra.',risk:data.level,actionLabel:'Mở luồng'}]}
    await insertMessage(shopId,threadId,risk,dbClient); await insertMessage(shopId,'hub',notice,dbClient)
    const view={...thread,updatedAt:formatTime(new Date(row.detected_at))}
    return {alert,created:true,events:[{type:'thread',thread:view},{type:'message',conversationId:threadId,message:risk},{type:'message',conversationId:'hub',message:notice}]}
  }
  if(client) return create(client)
  const result=await withTransaction(create);publishAlert(shopId,result.events);return result
}
export async function listAlerts(shopId,{status}={}) { return (await alertRepo.list(shopId,status)).map(toView) }
async function change(shopId,id,status) {
  const result=await withTransaction(async (client)=>{
    const row=await alertRepo.find(shopId,id,client,true);if(!row)throw missing(); if(row.status!=='OPEN')throw conflict()
    await alertRepo.setStatus(shopId,id,status,client)
    const updated=toView(await alertRepo.find(shopId,id,client)); const threadId=`alert-${id}`
    const old=await messageRepo.getMessage(shopId,`risk-${id}`,client,true)
    const message=old?{...old,blocks:[{type:'text',text:status==='HELD'?'Đã tạm giữ cảnh báo. Trạng thái đơn hàng không thay đổi.':'Đã bỏ qua cảnh báo. Trạng thái đơn hàng không thay đổi.'}]}:null
    if(message)await messageRepo.updateMessage(shopId,message.id,message,client)
    const thread=await threadRepo.setThread(shopId,threadId,'done',client)
    return {alert:updated,events:[...(message?[{type:'message',conversationId:threadId,message}]:[]),...(thread?[{type:'thread',thread:{id:thread.id,title:thread.title,status:thread.status,scope:thread.scope,updatedAt:formatTime(thread.updated_at)}}]:[])]}
  });publishAlert(shopId,result.events);return {alert:result.alert}
}
export const holdAlert=(shopId,id)=>change(shopId,id,'HELD')
export const dismissAlert=(shopId,id)=>change(shopId,id,'DISMISSED')
export async function dismissNotice(shopId,id) {
  const message=await withTransaction(async (client)=>{ const alert=await alertRepo.find(shopId,id,client,true);if(!alert)throw missing();const old=await messageRepo.getMessage(shopId,`notice-${id}`,client,true); if(!old)throw missing(); if(!old.blocks.some((block)=>block.type==='proactiveNotice'))return null; const next={...old,blocks:[{type:'text',text:'Đã tắt nhắc nhở cảnh báo.'}]};await messageRepo.updateMessage(shopId,next.id,next,client);return next })
  if(message)publish(shopId,{type:'message',conversationId:'hub',message})
}
