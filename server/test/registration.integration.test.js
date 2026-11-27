import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

test('Đăng ký, email trùng, đăng nhập và tài khoản demo', { skip: process.env.RUN_AUTH_INTEGRATION !== '1' }, async () => {
  const { pool } = await import('../src/db/pool.js')
  const id = randomUUID()
  const email = `test-${id}@example.invalid`
  const shopName = `Kiểm thử ${id}`
  const password = 'test-password-123'
  const post = (path, body) => fetch(`http://127.0.0.1:4000/api/auth/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  try {
    assert.equal((await post('register', { ownerName: 'Kiểm thử', shopName, email, password: 'short', acceptedTerms: true })).status, 400)
    const created = await post('register', { ownerName: 'Kiểm thử', shopName, email, password, acceptedTerms: true })
    assert.equal(created.status, 201)
    const { token } = await created.json()
    const me = await fetch('http://127.0.0.1:4000/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
    const session = await me.json()
    assert.equal(session.shop.isDemo, false)
    assert.equal(session.shop.name, shopName)
    assert.equal(session.user.ownerName, 'Kiểm thử')
    assert.equal((await post('register', { ownerName: 'Kiểm thử', shopName, email, password, acceptedTerms: true })).status, 409)
    const count = await pool.query('SELECT count(*)::int AS total FROM shops WHERE name = $1', [shopName])
    assert.equal(count.rows[0].total, 1)
    const user = await pool.query('SELECT password_hash FROM users WHERE email = $1', [email])
    assert.notEqual(user.rows[0].password_hash, password)
    assert.equal((await post('login', { email, password: 'incorrect' })).status, 401)
    assert.equal((await post('login', { email, password })).status, 200)
    const demo = await post('demo', {})
    assert.equal(demo.status, 200)
    const demoSession = await fetch('http://127.0.0.1:4000/api/auth/me', { headers: { Authorization: `Bearer ${(await demo.json()).token}` } })
    assert.equal((await demoSession.json()).shop.isDemo, true)
  } finally {
    await pool.query('DELETE FROM users WHERE email = $1', [email])
    await pool.query('DELETE FROM shops WHERE name = $1', [shopName])
    await pool.end()
  }
})
