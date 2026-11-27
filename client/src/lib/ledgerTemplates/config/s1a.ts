import { amount, date, description } from '../columns'
import type { Template } from '../types'
export default { code: 'S1a-HKD', name: 'Sổ doanh thu bán hàng hóa, dịch vụ', appliesTo: 'Tham khảo cho hộ không thuộc diện chịu thuế GTGT, không phải nộp thuế TNCN.', needsReview: true, filter: 'revenue', columns: [date, description, amount], note: 'Chỉ gồm khoản đã phân loại là doanh thu kinh doanh.' } satisfies Template
