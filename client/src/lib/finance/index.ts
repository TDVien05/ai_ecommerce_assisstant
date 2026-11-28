import { mockFinance } from './mock'
import { httpFinance } from './http'
import { isReal } from '@/lib/realApi'
import type { FinanceApi } from './types'

export const financeApi: FinanceApi = isReal('finance') ? httpFinance : mockFinance
export * from './types'
