import type { Column } from './types'
export const date: Column = { key: 'date', label: 'Ngày tháng', value: 'date', source: 'occurredAt' }
export const description: Column = { key: 'description', label: 'Diễn giải', value: 'text', source: 'note hoặc mã đơn' }
export const amount: Column = { key: 'amount', label: 'Số tiền', value: 'money', source: 'amount', total: true }
export const doc: Column = { key: 'documentRef', label: 'Số hiệu chứng từ', value: 'text', source: 'documentRef' }
export const docDate: Column = { key: 'documentDate', label: 'Ngày chứng từ', value: 'date', source: 'documentDate' }
