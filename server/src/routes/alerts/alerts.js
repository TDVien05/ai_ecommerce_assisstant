import { Router } from 'express'
import { z } from 'zod'
import { validate } from '../../middlewares/validate.js'
import * as controller from '../../controllers/alerts/alerts.controller.js'
const id=validate(z.object({id:z.string().uuid()}).strict(),'params','Mã cảnh báo không hợp lệ.')
export const alertsRouter=Router()
alertsRouter.get('/',validate(z.object({status:z.enum(['OPEN','HELD','DISMISSED']).optional()}).strict(),'query','Bộ lọc không hợp lệ.'),controller.list)
alertsRouter.post('/:id/hold',id,controller.hold)
alertsRouter.post('/:id/dismiss',id,controller.dismiss)
