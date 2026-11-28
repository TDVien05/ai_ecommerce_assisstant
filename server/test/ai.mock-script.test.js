import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

const exec = promisify(execFile)
test('scenario file loads only for non-production mock mode', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'flowy-mock-'))
  try {
    const path = join(dir, 'scenario.json')
    await writeFile(path, JSON.stringify([{ content: 'scripted' }]))
    const script = "import {chat} from './src/services/ai/mock.js'; console.log((await chat({role:'agent',messages:[]})).message.content)"
    const run = async (mock, mode) => (await exec(process.execPath, ['--input-type=module', '-e', script], { cwd: process.cwd(), env: { ...process.env, AI_MOCK: mock, NODE_ENV: mode, AI_MOCK_SCRIPT: path } })).stdout.trim()
    assert.equal(await run('true', 'test'), 'scripted')
    assert.match(await run('true', 'production'), /^\[AI giả lập\]/)
    assert.match(await run('false', 'test'), /^\[AI giả lập\]/)
  } finally { await rm(dir, { recursive: true, force: true }) }
})
