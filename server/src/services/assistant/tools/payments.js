import { z } from 'zod'
import { listUnmatchedPayments } from '../../payments/payment.service.js'
export const unmatchedPayments = { name:'list_unmatched_payments', tier:'read', description:'Tình trạng hỗ trợ giao dịch chưa đối soát.', schema:z.object({}).strict(), run: () => listUnmatchedPayments() }
