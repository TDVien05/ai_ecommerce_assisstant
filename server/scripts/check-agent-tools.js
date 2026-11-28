// Manual, opt-in provider smoke test. Uses synthetic tool results, never customer data.
import { z } from 'zod'
import { runToolLoop, aiStatus } from '../src/services/ai/index.js'
import { pool } from '../src/db/pool.js'

if (aiStatus() !== 'live') throw new Error('Cần cấu hình AI thật trước khi chạy kiểm tra thủ công.')
const range = z.object({ from: z.string(), to: z.string() })
const tools = [
  { name: 'get_summary', description: 'Tổng hợp thu chi trong khoảng thời gian', schema: range, run: async () => ({ available: false }) },
  { name: 'list_ledger', description: 'Liệt kê các khoản sổ trong khoảng thời gian', schema: range.extend({ type: z.enum(['INCOME', 'EXPENSE']).optional() }), run: async () => ({ items: [] }) },
]
const cases = [
  ['Tổng kết thu chi hôm nay', 'get_summary'], ['Lãi tuần này?', 'get_summary'], ['Doanh thu tháng này?', 'get_summary'],
  ['Tổng chi năm nay?', 'get_summary'], ['Tổng kết tháng trước', 'get_summary'],
  ['Liệt kê khoản sổ hôm nay', 'list_ledger'], ['Liệt kê khoản chi tuần này', 'list_ledger'],
  ['Các khoản thu tháng này', 'list_ledger'], ['Xem sổ tháng trước', 'list_ledger'], ['Liệt kê chi phí trong năm', 'list_ledger'],
]
let correct = 0
try {
  for (const [text, expected] of cases) {
    const result = await runToolLoop({ role: 'agent', messages: [{ role: 'system', content: 'Hôm nay là 2026-11-28, múi giờ Việt Nam. Dùng công cụ phù hợp; from gồm, to không gồm, theo ISO 8601.' }, { role: 'user', content: text }], tools, maxRounds: 3 })
    if (result.toolCalls.some((call) => call.name === expected && call.ok)) correct++
  }
  console.log(`Gọi công cụ đúng: ${correct}/${cases.length}`)
} finally { await pool.end() }
