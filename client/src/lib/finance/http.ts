import { api } from '@/lib/api'
import type { FinanceApi } from './types'

export const httpFinance: FinanceApi = {
  ledger: (query = {}) => api.get('/finance/ledger', query),
  createEntry: (body) => api.post('/finance/ledger', body),
  deleteEntry: (id) => api.delete(`/finance/ledger/${encodeURIComponent(id)}`),
  summary: (query = {}) => api.get('/finance/summary', query),
  timeseries: (query = {}) => api.get('/finance/timeseries', query),
  topProducts: (query = {}) => api.get('/finance/top-products', query),
}
