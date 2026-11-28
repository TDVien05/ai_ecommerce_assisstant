import { Router } from 'express'
import { z } from 'zod'
import { validate } from '../../middlewares/validate.js'
import * as controller from '../../controllers/finance/finance.controller.js'
import { badRequest } from '../../lib/httpError.js'

const timestamp = z.string().datetime({ offset: true })
const period = { from: timestamp.optional(), to: timestamp.optional() }
const query = (shape) => validate(z.object(shape).strict(), 'query', 'Bộ lọc không hợp lệ.')
const entry = z.object({
  type: z.enum(['INCOME', 'EXPENSE']), kind: z.enum(['BUSINESS_REVENUE', 'PERSONAL', 'EXPENSE', 'TRANSFER']), channel: z.enum(['CASH', 'BANK', 'EWALLET']),
  category: z.enum(['SALES', 'SHIPPING', 'ADS', 'INVENTORY', 'OTHER']), amount: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  documentRef: z.string().max(120).nullable(), documentDate: z.string().date().nullable(), industry: z.string().max(120).nullable(), note: z.string().max(500), occurredAt: timestamp,
}).strict()
const id = (req, _res, next) => { if (!z.string().uuid().safeParse(req.params.id).success) throw badRequest('Mã khoản sổ không hợp lệ.'); next() }

export const financeRouter = Router()
financeRouter.get('/ledger', query({ ...period, type: z.enum(['INCOME', 'EXPENSE']).optional() }), controller.ledger)
financeRouter.post('/ledger', validate(entry, 'body', 'Thông tin khoản sổ không hợp lệ.'), controller.create)
financeRouter.delete('/ledger/:id', id, controller.remove)
financeRouter.get('/summary', query(period), controller.summary)
financeRouter.get('/timeseries', query({ ...period, interval: z.enum(['day', 'week']).optional() }), controller.timeseries)
financeRouter.get('/top-products', query({ ...period, limit: z.coerce.number().int().min(1).max(100).optional() }), controller.topProducts)
