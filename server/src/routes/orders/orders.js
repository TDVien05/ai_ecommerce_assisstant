import { Router } from 'express'
import { z } from 'zod'
import { validate } from '../../middlewares/validate.js'
import * as controller from '../../controllers/orders/orders.controller.js'
const id = validate(z.object({id:z.string().uuid()}).strict(),'params','Mã đơn không hợp lệ.')
const date = z.string().datetime({offset:true})
export const ordersRouter = Router()
ordersRouter.get('/',validate(z.object({status:z.enum(['AWAITING_PAYMENT','PAID','SHIPPING','COMPLETED','CANCELLED','EXPIRED','REFUNDED']).optional(),from:date.optional(),to:date.optional()}).strict(),'query','Bộ lọc không hợp lệ.'),controller.list)
ordersRouter.get('/:id',id,controller.get)
ordersRouter.patch('/:id/status',id,validate(z.object({status:z.enum(['SHIPPING','COMPLETED','CANCELLED'])}).strict(),'body','Trạng thái không hợp lệ.'),controller.update)
