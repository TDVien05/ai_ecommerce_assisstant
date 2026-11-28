import { getBook, getThreshold, listTemplates } from '@/lib/mockServer/ledgerBooks'
import { subscribeLedger } from '@/lib/mockServer/store'
import { api } from '@/lib/api'
import { isReal } from '@/lib/realApi'
import { templates } from './config'
import type { LedgerBook, TemplateCode, Threshold } from './types'

export const realLedgerTemplatesApi = {
  list: async () => ({ items: templates }),
  book: async (code: TemplateCode, from: string, to: string): Promise<LedgerBook> => {
    const result = await api.get<Omit<LedgerBook, 'template'>>('/finance/ledger-book', { code, from, to })
    const template = templates.find((item) => item.code === code)
    if (!template) throw new Error('Không tìm thấy mẫu sổ.')
    return { ...result, template }
  },
  threshold: () => api.get<Threshold>('/finance/ledger-threshold'),
  subscribe: (listener: () => void) => { window.addEventListener('flowy:ledger-changed', listener); return () => window.removeEventListener('flowy:ledger-changed', listener) },
}
export const ledgerTemplatesApi = isReal('finance') || isReal('assistant') ? realLedgerTemplatesApi : { list: listTemplates, book: getBook, threshold: getThreshold, subscribe: subscribeLedger }
export * from './types'
