import { useState } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Money } from './Money'

export type DataColumn = { key: string; label: string; kind: 'text' | 'number' | 'money' | 'date' | 'boolean' }
export type DataValue = string | number | null

export function DataTable({ columns, rows, source, updatedAt, how }: { columns: DataColumn[]; rows: DataValue[][]; source: string; updatedAt: string; how: string }) {
  const [open, setOpen] = useState(false)
  return <div className="flex flex-col gap-2">
    <div className="overflow-x-auto border border-border"><Table><TableHeader><TableRow>{columns.map((column) => <TableHead key={column.key}>{column.label}</TableHead>)}</TableRow></TableHeader>
      <TableBody>{rows.map((row, index) => <TableRow key={index}>{columns.map((column, i) => <TableCell key={column.key} className={column.kind === 'money' || column.kind === 'number' ? 'text-right' : ''}>{row[i] === null ? '—' : column.kind === 'money' && typeof row[i] === 'number' ? <Money value={row[i] as number} /> : column.kind === 'number' && typeof row[i] === 'number' ? new Intl.NumberFormat('vi-VN').format(row[i] as number) : column.kind === 'date' && typeof row[i] === 'string' && !Number.isNaN(Date.parse(row[i] as string)) ? new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(row[i] as string)) : String(row[i])}</TableCell>)}</TableRow>)}</TableBody></Table></div>
    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground"><span>Nguồn: {source}, cập nhật {updatedAt}</span><button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="text-foreground underline underline-offset-[3px]">Cách tính</button></div>
    {open && <p className="bg-muted px-3 py-2 text-sm">{how}</p>}
  </div>
}
