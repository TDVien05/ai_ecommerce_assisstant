import * as threadRepo from '../../repositories/assistant/assistantThread.repository.js'
import * as messageRepo from '../../repositories/assistant/assistantMessage.repository.js'
import * as events from './events.js'
import { formatTime } from './view.js'

export function threadView(row) { return {id:row.id,title:row.title,status:row.status,scope:row.scope,updatedAt:formatTime(row.updated_at)} }
export function summary(row,detail) {
  return {id:`summary-${row.id}`,role:'assistant',blocks:[{type:'threadSummary',threadId:row.id,title:row.title,status:row.status === 'running' ? 'waiting' : row.status,updatedAt:formatTime(row.updated_at),summary:detail}]}
}
export async function updateThread(shopId,id,status,detail,client) {
  if (!await threadRepo.getThread(shopId,id,client,true)) return null
  const row=await threadRepo.setThread(shopId,id,status,client)
  const message=summary(row,detail)
  await messageRepo.setSummary(shopId,message.id,message,client)
  return {thread:threadView(row),message}
}
export function publishUpdate(shopId,update) {
  if (!update) return
  events.publish(shopId,{type:'thread',thread:update.thread})
  events.publish(shopId,{type:'message',conversationId:'hub',message:update.message})
}
