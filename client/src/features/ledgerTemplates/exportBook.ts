import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces'
import type { BookRow, BookSection, Column, LedgerBook } from '@/lib/ledgerTemplates'

export type BookIdentity = { name: string; taxId: string; address: string; location: string; periodLabel: string }
type ExportColumn = { key: string; label: string; value: Column['value'] }
type ExportCell = string | number | null
type ExportRow = { cells: ExportCell[]; bold?: boolean; group?: boolean }

function columns(book: LedgerBook, extra: string[]): ExportColumn[] {
  return [...book.template.columns.map(({ key, label, value }) => ({ key, label, value })), ...extra.map((label, index) => ({ key: `extra-${index}`, label, value: 'text' as const }))]
}
function value(row: BookRow, column: ExportColumn): ExportCell { return (row.cells as Record<string, ExportCell | undefined>)[column.key] ?? null }
function totalRow(section: BookSection, cols: ExportColumn[], label: string): ExportCell[] {
  return cols.map((column, index) => index === 0 ? label : (section.totals as Record<string, number | null | undefined>)[column.key] ?? null)
}
function rows(book: LedgerBook, cols: ExportColumn[]): ExportRow[] {
  const output: ExportRow[] = []
  const balanceColumn = cols.reduce((last, column, index) => column.value === 'money' ? index : last, -1)
  for (const section of book.sections) {
    if (section.title) output.push({ cells: [section.title, ...cols.slice(1).map(() => null)], bold: true, group: true })
    if (book.template.code === 'S2e-HKD') output.push({ cells: ['Số dư đầu kỳ', ...cols.slice(1).map((_column, i) => i + 1 === balanceColumn ? section.openingBalance : null)] })
    for (const row of section.rows) output.push({ cells: cols.map((column) => value(row, column)) })
    if (!section.rows.length) output.push({ cells: ['Chưa có dữ liệu', ...cols.slice(1).map(() => null)] })
    if (book.template.columns.some((column) => column.total)) output.push({ cells: totalRow(section, cols, 'Tổng cộng'), bold: true })
    if (book.template.code === 'S2e-HKD') output.push({ cells: ['Số dư cuối kỳ', ...cols.slice(1).map((_column, i) => i + 1 === balanceColumn ? section.closingBalance : null)] })
    if (book.template.code === 'S2a-HKD' || book.template.code === 'S2b-HKD') {
      output.push({ cells: ['Thuế GTGT (chưa có dữ liệu)', ...cols.slice(1).map(() => null)] })
      if (book.template.code === 'S2a-HKD') output.push({ cells: ['Thuế TNCN (chưa có dữ liệu)', ...cols.slice(1).map(() => null)] })
    }
  }
  return output
}
function formatted(cell: ExportCell, column: ExportColumn): string {
  if (cell === null || cell === '') return ''
  if (column.value === 'date') { const date = new Date(String(cell)); return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }).format(date) }
  if ((column.value === 'money' || column.value === 'number') && typeof cell === 'number') return new Intl.NumberFormat('vi-VN').format(cell)
  return String(cell)
}

export async function exportPdf(book: LedgerBook, identity: BookIdentity, extra: string[], filename: string): Promise<void> {
  const pdfModule = await import('pdfmake/build/pdfmake')
  const fontsModule = await import('pdfmake/build/vfs_fonts')
  const pdf = ((pdfModule as unknown as { default?: typeof pdfModule }).default ?? pdfModule)
  const fonts = ((fontsModule as unknown as { default?: Record<string, string> }).default ?? fontsModule) as Record<string, string>
  const cols = columns(book, extra)
  const body: Content[][] = [cols.map((column) => ({ text: column.label, bold: true, fontSize: 8 }))]
  for (const item of rows(book, cols)) body.push(item.cells.map((cell, index) => ({ text: formatted(cell, cols[index]), bold: item.bold, fontSize: 8, alignment: cols[index].value === 'money' ? 'right' : 'left' })))
  const content: Content[] = [
    { text: `HỘ, CÁ NHÂN KINH DOANH: ${identity.name || '................................'}` },
    { text: `Địa chỉ: ${identity.address || '................................'}    Mã số thuế: ${identity.taxId || '................................'}` },
    { text: `Mẫu số ${book.template.code} · Cần đối chiếu bản gốc`, alignment: 'right', margin: [0, 8, 0, 4] },
    { text: book.template.name.toLocaleUpperCase('vi-VN'), alignment: 'center', bold: true, fontSize: 13, margin: [0, 5, 0, 5] },
    { text: `Địa điểm kinh doanh: ${identity.location || '................................'}    Kỳ: ${identity.periodLabel}    Đơn vị tính: đồng`, margin: [0, 0, 0, 8] },
    { table: { headerRows: 1, widths: cols.map(() => '*'), body } },
    ...book.warnings.map((warning): Content => ({ text: warning, fontSize: 8, margin: [0, 5, 0, 0] })),
    { text: 'Ngày ...... tháng ...... năm ..........', alignment: 'right', margin: [0, 20, 0, 4] },
    { text: 'NGƯỜI ĐẠI DIỆN HỘ KINH DOANH / CÁ NHÂN KINH DOANH\n(Ký, ghi rõ họ tên, đóng dấu nếu có)', alignment: 'right', bold: true, fontSize: 9 },
  ]
  const definition: TDocumentDefinitions = { pageSize: 'A4', pageOrientation: cols.length > 7 ? 'landscape' : 'portrait', pageMargins: [28, 28, 28, 35], defaultStyle: { font: 'Roboto', fontSize: 9 }, content, footer: (current, count) => ({ text: `Trang ${current}/${count}`, alignment: 'center', fontSize: 8 }) }
  pdf.createPdf(definition, undefined, undefined, fonts).download(filename)
}

export async function exportExcel(book: LedgerBook, identity: BookIdentity, extra: string[], filename: string): Promise<void> {
  const Excel = await import('exceljs')
  const workbook = new Excel.Workbook()
  const sheet = workbook.addWorksheet(book.template.code, { pageSetup: { paperSize: 9, orientation: book.template.columns.length > 7 ? 'landscape' : 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } })
  const cols = columns(book, extra)
  sheet.columns = cols.map((column) => ({ width: column.value === 'text' ? 28 : 18 }))
  const heading = [
    `HỘ, CÁ NHÂN KINH DOANH: ${identity.name || '................................'}`,
    `Địa chỉ: ${identity.address || '................................'}    Mã số thuế: ${identity.taxId || '................................'}`,
    `Mẫu số ${book.template.code} · Cần đối chiếu bản gốc`,
    book.template.name.toLocaleUpperCase('vi-VN'),
    `Địa điểm kinh doanh: ${identity.location || '................................'}    Kỳ: ${identity.periodLabel}    Đơn vị tính: đồng`,
  ]
  for (const line of heading) { const result = sheet.addRow([line]); sheet.mergeCells(result.number, 1, result.number, cols.length); result.font = { name: 'Arial', bold: result.number === 4, size: result.number === 4 ? 13 : 10 }; result.alignment = { wrapText: true, horizontal: result.number === 4 ? 'center' : 'left' } }
  const header = sheet.addRow(cols.map((col) => col.label)); header.font = { name: 'Arial', bold: true }; header.alignment = { wrapText: true, vertical: 'middle' }
  for (const item of rows(book, cols)) {
    const record = sheet.addRow(item.cells.map((cell, index) => cols[index].value === 'date' ? formatted(cell, cols[index]) : cell))
    record.font = { name: 'Arial', bold: item.bold }; record.alignment = { wrapText: true, vertical: 'middle' }
    cols.forEach((column, index) => { if (column.value === 'money') record.getCell(index + 1).numFmt = '#,##0'; record.getCell(index + 1).border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } } })
  }
  for (const warning of book.warnings) { const record = sheet.addRow([warning]); sheet.mergeCells(record.number, 1, record.number, cols.length); record.alignment = { wrapText: true }; record.height = 30 }
  sheet.addRow(['Ngày ...... tháng ...... năm ..........'])
  sheet.addRow(['NGƯỜI ĐẠI DIỆN HỘ KINH DOANH / CÁ NHÂN KINH DOANH'])
  sheet.addRow(['(Ký, ghi rõ họ tên, đóng dấu nếu có)'])
  sheet.headerFooter.oddFooter = '&CTrang &P/&N'
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}
