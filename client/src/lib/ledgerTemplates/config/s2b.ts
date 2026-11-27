import { amount, description, doc, docDate } from '../columns'
import type { Template } from '../types'
export default { code: 'S2b-HKD', name: 'Sổ doanh thu bán hàng hóa, dịch vụ', appliesTo: 'Tham khảo cho hộ nộp GTGT theo doanh thu và TNCN theo thu nhập.', needsReview: true, filter: 'revenue', columns: [doc, docDate, description, amount], note: 'Cần bổ sung nhóm ngành, chứng từ và số thuế theo hồ sơ thực tế.' } satisfies Template
