import { getBook, getThreshold, listTemplates } from '@/lib/mockServer/ledgerBooks'
import { subscribeLedger } from '@/lib/mockServer/store'
export const ledgerTemplatesApi = { list: listTemplates, book: getBook, threshold: getThreshold, subscribe: subscribeLedger }
export * from './types'
