import { z } from 'zod'
import { getPartialReports } from '../../finance/finance.service.js'
import { appError } from '../../../errors/index.js'

const date=z.string().datetime({offset:true})
export const reportTool={
  name:'get_report',tier:'read',description:'Báo cáo doanh thu, chi phí, lãi và dòng tiền từ sổ; có thể so sánh với kỳ khác. Khoảng from gồm, to không gồm.',
  schema:z.object({from:date,to:date,compareFrom:date.optional(),compareTo:date.optional()}).strict().refine((v)=>Boolean(v.compareFrom)===Boolean(v.compareTo)),
  async run(input,ctx) {
    if(Date.parse(input.from)>=Date.parse(input.to) || (input.compareFrom && Date.parse(input.compareFrom)>=Date.parse(input.compareTo)))throw appError('BAD_REQUEST','Khoảng thời gian không hợp lệ.')
    const [current,previous=null]=await getPartialReports(ctx.shopId,[{from:input.from,to:input.to},...(input.compareFrom?[{from:input.compareFrom,to:input.compareTo}]:[])])
    const diff=(a,b)=>{const value=a-b;if(!Number.isSafeInteger(value))throw appError('BAD_REQUEST','Chênh lệch vượt giới hạn.');return value}
    const difference=previous?{revenue:diff(current.revenue,previous.revenue),expenses:diff(current.expenses,previous.expenses),netProfit:current.netProfit===null||previous.netProfit===null?null:diff(current.netProfit,previous.netProfit)}:null
    return {current:{...current,from:input.from,to:input.to},previous:previous?{...previous,from:input.compareFrom,to:input.compareTo}:null,difference}
  },
}
