import { toast } from 'sonner'
import { toastDone } from '@/components/flowy'
import { ai } from '@/lib/ai'

/** Chạy một lệnh gửi cho AI; lỗi thì báo bằng thông báo. */
export function run(command: Promise<unknown>) {
  command.catch((err: unknown) => {
    toast.error(err instanceof Error ? err.message : 'Không gửi được. Bạn thử lại nhé.')
  })
}

export function approve(stepId: string) {
  run(ai.approve(stepId).then(({ message }) => toastDone(message, () => run(ai.undo(stepId)))))
}
