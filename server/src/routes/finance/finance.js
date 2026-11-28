import { Router } from 'express'
import * as validator from '../../validators/finance/finance.validator.js'
import * as controller from '../../controllers/finance/finance.controller.js'

export const financeRouter = Router()
financeRouter.get('/ledger', validator.ledger, controller.ledger)
financeRouter.get('/ledger-book', validator.book, controller.book)
financeRouter.get('/ledger-threshold', validator.threshold, controller.threshold)
financeRouter.post('/ledger', validator.create, controller.create)
financeRouter.delete('/ledger/:id', validator.entryId, controller.remove)
financeRouter.get('/summary', validator.summary, controller.summary)
financeRouter.get('/report', validator.summary, controller.report)
financeRouter.get('/timeseries', validator.timeseries, controller.timeseries)
financeRouter.get('/top-products', validator.topProducts, controller.topProducts)
