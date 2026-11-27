import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

test('SPA fallback không bắt các tuyến API, webhook và health', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'flowy-static-'))
  await writeFile(path.join(directory, 'index.html'), '<!doctype html><title>Flowy test</title>')
  process.env.NODE_ENV = 'test'
  process.env.DATABASE_URL = 'postgres://localhost/test'
  process.env.JWT_SECRET = 'test-secret-only'
  process.env.SERVE_CLIENT_DIR = directory
  const { createApp } = await import('../src/app.js')
  const { pool } = await import('../src/db/pool.js')
  const server = createApp().listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  try {
    const base = `http://127.0.0.1:${server.address().port}`
    const page = await fetch(`${base}/pages/ledger`)
    assert.equal(page.status, 200)
    assert.match(await page.text(), /Flowy test/)
    for (const route of ['/api/missing', '/webhooks/missing', '/health/missing']) {
      const response = await fetch(`${base}${route}`)
      assert.notEqual(response.headers.get('content-type')?.includes('text/html'), true)
      assert.ok(response.status >= 400)
    }
  } finally {
    await new Promise((resolve) => server.close(resolve))
    await pool.end()
    await rm(directory, { recursive: true, force: true })
  }
})
