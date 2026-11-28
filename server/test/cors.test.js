import { test } from 'node:test'
import assert from 'node:assert/strict'

test('CORS chỉ cho phép các origin trong CORS_ORIGIN, cả /api và /health', async () => {
  process.env.NODE_ENV = 'test'
  process.env.DATABASE_URL = 'postgres://localhost/test'
  process.env.JWT_SECRET = 'test-secret-only'
  process.env.CORS_ORIGIN = 'https://flowy.vientruong.site/, http://localhost:5173'
  const { createApp } = await import('../src/app.js')
  const { pool } = await import('../src/db/pool.js')
  const server = createApp().listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  try {
    const base = `http://127.0.0.1:${server.address().port}`
    const preflight = (path, origin) => fetch(`${base}${path}`, {
      method: 'OPTIONS',
      headers: { Origin: origin, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization' },
    })

    for (const path of ['/api/auth/me', '/health']) {
      const ok = await preflight(path, 'https://flowy.vientruong.site')
      assert.equal(ok.status, 204)
      assert.equal(ok.headers.get('access-control-allow-origin'), 'https://flowy.vientruong.site')
      assert.match(ok.headers.get('access-control-allow-headers'), /Authorization/)
      assert.match(ok.headers.get('vary'), /Origin/)
    }

    const dev = await preflight('/api/auth/me', 'http://localhost:5173')
    assert.equal(dev.headers.get('access-control-allow-origin'), 'http://localhost:5173')

    const foreign = await preflight('/api/auth/me', 'https://evil.example')
    assert.equal(foreign.headers.get('access-control-allow-origin'), null)

    // Error responses also carry the header, so the browser can read the JSON error.
    const unauthorized = await fetch(`${base}/api/auth/me`, { headers: { Origin: 'https://flowy.vientruong.site' } })
    assert.equal(unauthorized.status, 401)
    assert.equal(unauthorized.headers.get('access-control-allow-origin'), 'https://flowy.vientruong.site')
  } finally {
    await new Promise((resolve) => server.close(resolve))
    await pool.end()
  }
})
