// Dữ liệu giả cho bản mock. Số tiền ở đây đóng vai kết quả server trả về, không phải số thật.
import type { Block, Message, Snapshot } from './types'

/** Dữ liệu minh họa cho thẻ kết quả trên trang giới thiệu. */
export const landingRevenue = { amount: 2450000, source: 'sổ thu chi (dữ liệu minh họa)', updatedAt: '09:00' }

const pad = (n: number) => String(n).padStart(2, '0')

/** Giờ "21:42" của thời điểm cách đây `minutesAgo` phút. */
export function clock(minutesAgo = 0) {
  const d = new Date(Date.now() - minutesAgo * 60_000)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function today() {
  const d = new Date()
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`
}

export const say = (id: string, ...blocks: Block[]): Message => ({ id, role: 'assistant', blocks })
export const text = (value: string): Block => ({ type: 'text', text: value })

export function ledgerStep(stepId: string): Extract<Block, { type: 'agentStep' }> {
  const options = ['Nhập hàng', 'Phí ship', 'Khác']
  return {
    type: 'agentStep',
    stepId,
    title: 'Ghi 14 giao dịch vào sổ',
    state: 'waiting',
    steps: [
      { label: 'Đọc sao kê VCB', meta: '14 dòng', status: 'done' },
      { label: 'Khớp 9 giao dịch với đơn trên Messenger', meta: 'Theo giao dịch ngân hàng đã báo về', status: 'done' },
      { label: 'Phân loại 2 dòng chưa rõ', status: 'needs' },
    ],
    questions: [
      { id: 'a', label: '−350.000 ₫ · "CK NGUYEN VAN B"', options },
      { id: 'b', label: '−120.000 ₫ · "GRAB*A2F"', options },
    ],
    approveLabel: 'Duyệt và ghi sổ',
    undoNote: 'Hoàn tác sẽ xóa 14 dòng vừa ghi khỏi sổ',
  }
}

export function profitResult(): Block {
  return {
    type: 'resultCard',
    source: 'sổ thu chi (dữ liệu mẫu)',
    updatedAt: clock(),
    metrics: [
      { label: 'Doanh thu tuần', value: 41_300_000, delta: '▲ 8% so với tuần trước', tone: 'good' },
      { label: 'Chi phí', value: 29_850_000, delta: '▲ 14% do nhập hàng', tone: 'bad' },
      { label: 'Lãi tạm tính', value: 11_450_000, delta: 'chưa gồm các dòng chờ duyệt' },
    ],
    how: [
      { label: 'Doanh thu (86 đơn đã thanh toán)', value: 41_300_000 },
      { label: 'Nhập hàng', value: -24_600_000 },
      { label: 'Phí ship và khác', value: -5_250_000 },
      { label: 'Lãi tạm tính', value: 11_450_000, total: true },
    ],
  }
}

export function initialSnapshot(): Snapshot {
  const day = today()
  return {
    shopName: 'Lan Closet',
    typing: [],
    threads: [
      {
        id: 't-1042',
        title: 'Kiểm tra đơn #1042',
        status: 'alert',
        updatedAt: clock(25),
        scope: 'Luồng này chỉ kiểm tra đơn #1042. Đơn đang được giữ, chưa giao.',
      },
      {
        id: 't-ledger',
        title: `Ghi sổ sao kê ${day}`,
        status: 'waiting',
        updatedAt: clock(3),
        scope: `Luồng này chỉ ghi sổ sao kê VCB ngày ${day}. Xong việc, kết quả sẽ được tóm tắt về chat trung tâm.`,
      },
      {
        id: 't-week',
        title: 'Báo cáo tuần',
        status: 'running',
        updatedAt: clock(),
        scope: 'Luồng này chỉ lập báo cáo tuần.',
      },
      {
        id: 't-remind',
        title: 'Nhắc 3 khách nhận hàng',
        status: 'done',
        updatedAt: clock(95),
        scope: 'Luồng này chỉ nhắc 3 khách nhận hàng.',
      },
    ],
    conversations: {
      hub: [
        say('summary-t-remind', {
          type: 'threadSummary',
          threadId: 't-remind',
          title: 'Nhắc 3 khách nhận hàng',
          status: 'done',
          updatedAt: clock(95),
          summary: 'Đã nhắn 3 khách qua Messenger. 2 khách xác nhận đã nhận, khách đơn #1038 chưa trả lời.',
        }),
        say('notice-n-1042', {
          type: 'proactiveNotice',
          noticeId: 'n-1042',
          threadId: 't-1042',
          risk: 'high',
          headline: 'Đơn #1042 có dấu hiệu lừa đảo.',
          detail:
            'Khách gửi ảnh bill 1.200.000 ₫ nhưng ngân hàng chưa báo tiền vào, và số tài khoản trong ảnh không phải của cửa hàng. Mình đã giữ đơn lại và mở luồng kiểm tra.',
          actionLabel: 'Mở luồng kiểm tra',
        }),
        say('summary-t-ledger', {
          type: 'threadSummary',
          threadId: 't-ledger',
          title: `Ghi sổ sao kê ${day}`,
          status: 'waiting',
          updatedAt: clock(3),
          summary: 'Đã đọc 14 giao dịch, khớp 9 giao dịch với đơn. Còn 2 dòng cần bạn chọn loại trước khi ghi sổ.',
        }),
      ],
      't-1042': [
        say('m-1042', {
          type: 'riskAlert',
          alertId: 'a-1042',
          title: 'Đơn #1042 có dấu hiệu lừa đảo',
          level: 'high',
          reasons: [
            'Khách gửi ảnh bill 1.200.000 ₫ nhưng ngân hàng chưa báo tiền vào.',
            'Số tài khoản trong ảnh không phải của cửa hàng.',
          ],
          safeActionLabel: 'Giữ đơn, chưa giao',
          detectedNote: `Phát hiện lúc ${clock(25)} từ tin nhắn Messenger`,
        }),
      ],
      't-ledger': [
        { id: 'u-ledger', role: 'user', text: 'Nhập giúp mình sao kê hôm nay nhé.', files: ['saoke_VCB.xlsx'] },
        say(
          'm-ledger',
          text('Mình đã đọc file. 12 dòng phân loại được, còn 2 dòng cần bạn chọn.'),
          ledgerStep('s-ledger'),
        ),
      ],
      't-week': [say('m-week', text('Mình đang gom số liệu trong tuần, xong sẽ báo ở chat trung tâm.'))],
      't-remind': [say('m-remind', text('Đã nhắn 3 khách qua Messenger. Khách đơn #1038 chưa trả lời.'))],
    },
  }
}
