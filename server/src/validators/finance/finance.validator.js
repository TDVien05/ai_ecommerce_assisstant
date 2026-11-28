// Input of the /api/finance routes. See docs/ARCHITECTURE.md, section "Validators".
import { z } from 'zod'
import { validate } from '../validate.js'
import { badRequest } from '../../errors/index.js'

const timestamp = z.string().datetime({ offset: true })
const period = { from: timestamp.optional(), to: timestamp.optional() }
const query = (shape) => validate(z.object(shape).strict(), 'query', 'Bộ lọc không hợp lệ.')
const entry = z.object({
  type: z.enum(['INCOME', 'EXPENSE']), kind: z.enum(['BUSINESS_REVENUE', 'PERSONAL', 'EXPENSE', 'TRANSFER']), channel: z.enum(['CASH', 'BANK', 'EWALLET']),
  category: z.enum(['SALES', 'SHIPPING', 'ADS', 'INVENTORY', 'OTHER']), amount: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  documentRef: z.string().max(120).nullable(), documentDate: z.string().date().nullable(), industry: z.string().max(120).nullable(), note: z.string().max(500), occurredAt: timestamp,
}).strict()

export const ledger = query({ ...period, type: z.enum(['INCOME', 'EXPENSE']).optional() })
export const create = validate(entry, 'body', 'Thông tin khoản sổ không hợp lệ.')
/** :id of a ledger entry. Checks only the id, so req.params is left as it is. */
export const entryId = (req, _res, next) => { if (!z.string().uuid().safeParse(req.params.id).success) throw badRequest('Mã khoản sổ không hợp lệ.'); next() }
export const summary = query(period)
export const timeseries = query({ ...period, interval: z.enum(['day', 'week']).optional() })
export const topProducts = query({ ...period, limit: z.coerce.number().int().min(1).max(100).optional() })
