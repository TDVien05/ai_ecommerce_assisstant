import { env } from '../../config/env.js'
import { appError } from '../../errors/index.js'
const dayFormatter = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'})
export function createRunLimiter(limit,now=()=>new Date()) {
  const shops=new Map()
  return function reserve(shopId) {
    const day=dayFormatter.format(now()); let counter=shops.get(shopId)
    if (!counter || counter.day !== day) { counter={day,count:0}; shops.set(shopId,counter) }
    if (counter.count>=limit) throw appError('AI_DAILY_LIMIT', 'Cửa hàng đã hết lượt trợ lý hôm nay. Vui lòng thử lại vào ngày mai.')
    counter.count++
    let pending=true
    return { commit:()=>{pending=false}, refund:()=>{if(pending){pending=false;counter.count--}} }
  }
}
export const reserveAgentRun=createRunLimiter(env.AI_DAILY_RUN_LIMIT)
