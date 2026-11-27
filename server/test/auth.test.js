import { test } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import jwt from 'jsonwebtoken'

process.env.NODE_ENV = 'test'
process.env.DATABASE_URL = 'postgres://localhost/test'
process.env.JWT_SECRET = 'test-secret-only'
const { requireAuth } = await import('../src/middlewares/requireAuth.js')
const { loginLimiter } = await import('../src/middlewares/loginLimiter.js')
const { errorHandler } = await import('../src/middlewares/errorHandler.js')

async function withServer(app, run) {
  const server = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  try { await run(`http://127.0.0.1:${server.address().port}`) } finally { await new Promise((resolve) => server.close(resolve)) }
}

test('Bearer token hợp lệ, hết hạn, sai chữ ký và thiếu token', async () => {
  const app = express()
  app.get('/private', requireAuth, (req, res) => res.json(req.auth))
  app.use(errorHandler)
  const valid = jwt.sign({ shopId: 'shop' }, process.env.JWT_SECRET, { subject: 'user', expiresIn: '1h' })
  const expired = jwt.sign({ shopId: 'shop' }, process.env.JWT_SECRET, { subject: 'user', expiresIn: -1 })
  const wrong = jwt.sign({ shopId: 'shop' }, 'wrong-secret', { subject: 'user' })
  await withServer(app, async (base) => {
    const response = await fetch(`${base}/private`, { headers: { Authorization: `Bearer ${valid}` } })
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { userId: 'user', shopId: 'shop' })
    for (const token of [expired, wrong, null]) {
      const headers = token ? { Authorization: `Bearer ${token}` } : {}
      assert.equal((await fetch(`${base}/private`, { headers })).status, 401)
    }
  })
})

test('Giới hạn sau năm lần đăng nhập sai', async () => {
  const app = express()
  app.use(express.json())
  app.post('/login', loginLimiter, (req, res) => { req.loginFailed(); res.sendStatus(401) })
  app.use(errorHandler)
  await withServer(app, async (base) => {
    for (let i = 0; i < 6; i++) {
      const response = await fetch(`${base}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'test@example.invalid' }) })
      assert.equal(response.status, i < 5 ? 401 : 429)
    }
  })
})
