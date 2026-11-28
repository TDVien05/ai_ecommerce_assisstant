import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { costNotice, periods } from '../src/services/assistant/proactiveRules.js'

test('weekly spending uses local calendar weeks and an exact threshold', () => {
  const window = periods(new Date('2026-11-22T17:00:00.000Z'))
  assert.equal(window.weekStart.toISOString(), '2026-11-22T17:00:00.000Z')
  assert.equal(window.historyStart.toISOString(), '2026-10-25T17:00:00.000Z')
  assert.equal(costNotice({ expenses: '120000', prior_expenses: '100000', prior_weeks: 1 }, window), null)
  assert.equal(costNotice({ expenses: '119999', prior_expenses: '200000', prior_weeks: 2 }, window), null)
  const notice = costNotice({ expenses: '120000', prior_expenses: '200000', prior_weeks: 2 }, window)
  assert.deepEqual(notice.result.metrics.map(({ value }) => value), [120000, 100000])
})

test('proactive notices are scoped, persistent, deduplicated and have a separate wording limit', {
  skip: !process.env.TEST_DATABASE_URL,
  timeout: 30_000,
}, async (t) => {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
  process.env.AI_MOCK = 'false'
  delete process.env.AI_MOCK_SCRIPT
  process.env.AI_BASE_URL = 'https://proactive.invalid/v1'
  process.env.AI_API_KEY = randomUUID()
  process.env.AI_MODEL = 'test'
  process.env.PROACTIVE_ENABLED = 'true'
  process.env.PROACTIVE_AI_DAILY_LIMIT = '2'
  const calls = []
  const fetch = t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://proactive.invalid/v1/chat/completions')
    const { messages, tools } = JSON.parse(options.body)
    assert.equal(tools, undefined)
    calls.push(JSON.parse(messages[1].content))
    if (calls.length === 2) return new Response('', { status: 503 })
    return Response.json({
      choices: [{ message: { content: JSON.stringify({
        risk: 'Bạn có thể xem lại thông tin đơn hàng.',
        cost: 'Bạn có thể xem lại 3 khoản chi.',
      }) } }],
    })
  })
  const { pool } = await import('../src/db/pool.js')
  const { withTransaction } = await import('../src/repositories/database.js')
  const { createAlert } = await import('../src/services/alerts/alerts.service.js')
  const { scanProactive, loadProactive, dismissProactive } = await import('../src/services/assistant/proactive.service.js')
  const main = randomUUID(), other = randomUUID(), customer = randomUUID()
  const now = new Date('2026-11-28T04:00:00.000Z')
  const at = (minutes) => new Date(now.getTime() + minutes * 60_000)
  const code = randomUUID()
  const query = (sql, params) => pool.query(sql, params)
  async function addOrder(suffix, risk) {
    const { rows: [{ id }] } = await query(`
      INSERT INTO orders (shop_id, customer_id, payment_code, subtotal, total, risk_level, expires_at)
      VALUES ($1, $2, $3, 1, 1, $4, $5) RETURNING id`, [main, customer, code + suffix, risk, at(-60)])
    return id
  }
  try {
    await query('INSERT INTO shops (id, name) VALUES ($1::uuid, $1::uuid::text), ($2::uuid, $2::uuid::text)', [main, other])
    await query('INSERT INTO customers (id, shop_id, psid) VALUES ($1::uuid, $2, $1::uuid::text)', [customer, main])
    await addOrder('-first', 'HIGH')
    const announced = await addOrder('-announced', 'HIGH')
    await withTransaction((client) => createAlert(main, {
      eventKey: 'test-order', level: 'high', title: 'Alert', reasons: ['Check'], orderId: announced,
    }, { client }))
    await query(`INSERT INTO ledger_entries (shop_id, type, category, kind, amount, occurred_at) VALUES
        ($1,'EXPENSE','ADS','EXPENSE',100000,'2026-11-10T01:00:00Z'),
        ($1,'EXPENSE','ADS','EXPENSE',100000,'2026-11-18T01:00:00Z'),
        ($1,'EXPENSE','ADS','EXPENSE',120000,$3),
        ($1,'INCOME','SALES','BUSINESS_REVENUE',800000000,$3),
        ($1,'INCOME','SALES',NULL,10,$3),
        ($2,'EXPENSE','ADS',NULL,100000000,$3)`, [main, other, at(-60)])
    await query(`INSERT INTO fraud_checks (shop_id, level, rule, metadata, created_at)
      VALUES ($1, 'HIGH', 'test', $2, $3)`, [main, { ignored: randomUUID() }, at(-60)])

    await Promise.all(Array.from({ length: 3 }, () => scanProactive(main, { opened: true, now })))
    const first = await loadProactive(main)
    assert.equal(first.notices.length, 5)
    assert.equal(first.notices[0].headline, `Đơn ${code}-first cần kiểm tra`)
    assert.equal(first.notices[0].wording, 'Bạn có thể xem lại thông tin đơn hàng.')
    assert.equal(first.notices.filter(({ risk }) => risk === 'high').length, 2)
    assert.ok(first.notices.some(({ target }) => target.filters.overdue === '1'))
    assert.equal(first.notices.find(({ target }) => target.filters.period === 'calendar-week').wording, undefined)
    assert.equal(first.notices.find(({ target }) => target.filters.unclassified === '1').result.metrics[0].value, 1)
    assert.equal(calls.length, 1)
    assert.equal(JSON.stringify(calls).includes(code), false)
    const id = first.notices[0].noticeId
    await scanProactive(other, { opened: true, now })
    const otherNotices = (await loadProactive(other)).notices
    assert.equal(otherNotices.length, 1)
    assert.equal(otherNotices[0].target.filters.unclassified, '1')
    await assert.rejects(dismissProactive(other, id), { code: 'ALERT_NOT_FOUND' })

    await dismissProactive(main, id)
    await dismissProactive(main, id)
    await scanProactive(main, { force: true, now: at(1) })
    const next = await loadProactive(main)
    assert.equal(next.notices.length, 5)
    assert.ok(!next.notices.some(({ noticeId }) => noticeId === id))
    const revenue = next.notices.find(({ legal }) => legal)
    assert.equal(revenue.result.metrics[0].value, 800000000)
    assert.equal(revenue.wording, undefined)
    const providerCalls = calls.length
    assert.equal(providerCalls, 3)
    await addOrder('-new', 'HIGH')
    await scanProactive(main, { force: true, now: at(2) })
    assert.ok((await loadProactive(main)).notices.some(({ headline }) => headline.includes(`${code}-new`)))
    assert.equal(calls.length, providerCalls)
    assert.equal(fetch.mock.callCount(), calls.length)

    const current = await loadProactive(main)
    await scanProactive(main, { opened: true, now: at(3) })
    assert.deepEqual(await loadProactive(main), current)
    await scanProactive(main, { force: true, now: at(4) })
    assert.deepEqual(await loadProactive(main), current)
  } finally {
    await query('DELETE FROM assistant_alerts WHERE shop_id IN ($1, $2)', [main, other])
    await query('DELETE FROM assistant_threads WHERE shop_id IN ($1, $2)', [main, other])
    await query('DELETE FROM ledger_entries WHERE shop_id IN ($1, $2)', [main, other])
    await query('DELETE FROM orders WHERE shop_id = $1', [main])
    await query('DELETE FROM customers WHERE shop_id = $1', [main])
    await query('DELETE FROM shops WHERE id IN ($1, $2)', [main, other])
    await pool.end()
  }
})
