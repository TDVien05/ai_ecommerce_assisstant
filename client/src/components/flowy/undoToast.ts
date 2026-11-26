import { toast } from 'sonner'

/**
 * Thông báo sau khi ghi dữ liệu, có nút Hoàn tác trong 10 giây.
 * Câu ở thì quá khứ, có số: "Đã ghi 14 giao dịch vào sổ."
 */
export function toastDone(message: string, onUndo?: () => void) {
  toast.success(message, {
    duration: 10_000,
    action: onUndo ? { label: 'Hoàn tác', onClick: onUndo } : undefined,
  })
}
