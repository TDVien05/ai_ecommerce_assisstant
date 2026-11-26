import { cn } from '@/lib/utils'
import { formatVND } from '@/lib/format'

type MoneyProps = {
  /** Số nguyên VND. Số âm hiển thị với dấu "−". */
  value: number
  size?: 'md' | 'lg'
  className?: string
}

/** Số tiền: chữ số thẳng cột, không xuống dòng. Luôn dùng component này thay vì tự format. */
export function Money({ value, size = 'md', className }: MoneyProps) {
  const text = value < 0 ? `−${formatVND(Math.abs(value))}` : formatVND(value)
  return (
    <span
      className={cn(
        'money',
        size === 'lg' ? 'text-[22px] leading-7 font-semibold tracking-tight' : 'font-medium',
        className,
      )}
    >
      {text}
    </span>
  )
}
