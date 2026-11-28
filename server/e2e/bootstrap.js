// This process is used only by the isolated Docker test project.
import { randomBytes, randomUUID } from 'node:crypto'
import { writeFile, unlink } from 'node:fs/promises'
import { watch } from 'node:fs'
import { spawn } from 'node:child_process'
import bcrypt from 'bcrypt'
import pg from 'pg'

if (process.env.NODE_ENV !== 'test' || process.env.AI_MOCK !== 'true') throw new Error('E2E requires test mock mode')
process.env.DEMO_EMAIL = `${randomUUID()}@example.invalid`
process.env.DEMO_PASSWORD = randomBytes(18).toString('hex')
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL })
const shopId = randomUUID(), userId = randomUUID(), customerId = randomUUID(), orderId = randomUUID()
const income = 310000 + Math.floor(Math.random() * 100) * 1000
const expense = 12000 + Math.floor(Math.random() * 50) * 1000
const note = `e2e-${randomUUID()}`, paymentCode = `T${randomBytes(6).toString('hex')}`
await db.query('INSERT INTO shops (id,name) VALUES ($1,$2)', [shopId, 'Cửa hàng kiểm thử'])
await db.query('INSERT INTO users (id,shop_id,email,password_hash) VALUES ($1,$2,$3,$4)', [userId, shopId, process.env.DEMO_EMAIL, await bcrypt.hash(process.env.DEMO_PASSWORD, 10)])
await db.query("INSERT INTO ledger_entries (shop_id,type,category,kind,channel,amount,note) VALUES ($1,'INCOME','SALES','BUSINESS_REVENUE','CASH',$2,$3)", [shopId, income, `income-${note}`])
await db.query('INSERT INTO customers (id,shop_id,psid) VALUES ($1,$2,$3)', [customerId, shopId, randomUUID()])
await db.query("INSERT INTO orders (id,shop_id,customer_id,payment_code,status,subtotal,total) VALUES ($1,$2,$3,$4,'PAID',$5,$5)", [orderId, shopId, customerId, paymentCode, income])
await db.end()
const { createAlert } = await import('../src/services/alerts/alerts.service.js')
await createAlert(shopId, { eventKey: randomUUID(), level: 'mid', title: 'Cảnh báo kiểm thử', reasons: ['Kiểm tra kết nối'] })
await createAlert(shopId, { eventKey: randomUUID(), level: 'mid', title: 'Cảnh báo kiểm thử', reasons: ['Kiểm tra kết nối'] })
const now = new Date(), tool = (name, input) => ({ tool_calls: [{ id: randomUUID(), type: 'function', function: { name, arguments: JSON.stringify(input) } }] })
const from = new Date(now.getTime() - 86400000).toISOString(), to = new Date(now.getTime() + 86400000).toISOString()
const classification = { content: JSON.stringify({ items: [{ index: 2, kind: 'EXPENSE', category: 'OTHER', confidence: 0.1, question: 'Chọn loại' }] }) }
const scenario = [tool('get_summary', { from, to }), { content: 'Đã tra cứu.' }, tool('add_ledger_entries', { entries: [{ type: 'EXPENSE', kind: 'EXPENSE', channel: 'CASH', category: 'OTHER', amount: expense, occurredAt: now.toISOString(), note }] }), { content: 'Đã chuẩn bị.' }, classification, classification, tool('update_order_status', { paymentCode, status: 'SHIPPING' }), { content: 'Đã chuẩn bị.' }, { content: 'Bạn cho mình biết số tiền cần ghi nhé.' }, { content: 'Mình không thể xóa toàn bộ sổ. Bạn hãy chọn từng khoản nhập tay để kiểm tra.' }]
await writeFile('/shared/scenario.json', JSON.stringify([...scenario, ...scenario, { content: 'Đã nhận yêu cầu.', delayMs: 10000 }]))
await writeFile('/shared/test.json', JSON.stringify({ shopId, orderId, paymentCode, income, expense, note }))

let child, stopping = false, restarting = false
const start = () => { child = spawn(process.execPath, ['src/index.js'], { stdio: 'inherit', env: process.env }); child.once('exit', () => { if (restarting && !stopping) { restarting = false; start(); void writeFile('/shared/restarted', 'ok') } else if (!stopping) process.exit(1) }) }
watch('/shared', async (_, name) => {
  if (name !== 'restart' || restarting || stopping) return
  restarting = true
  await unlink('/shared/restart').catch(() => {})
  child.kill('SIGTERM')
})
process.on('SIGTERM', () => { stopping = true; child.kill('SIGTERM'); child.once('exit', () => process.exit(0)) })
start()
