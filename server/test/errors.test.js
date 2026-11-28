import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { appError, toAppError, AppError, HttpError, ERROR_CODES } from '../src/errors/index.js'
import { AiUnavailableError } from '../src/services/ai/errors.js'
import { errorHandler } from '../src/middlewares/errorHandler.js'

const src = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src')
const pgError = (code, extra = {}) => Object.assign(new Error(`pg says ${code} for value secret@example.com`), { code, detail: 'Key (email)=(secret@example.com) already exists.', ...extra })

function respond(err) {
  const res = { statusCode: 0, body: null, status(code) { this.statusCode = code; return this }, json(body) { this.body = body; return this } }
  errorHandler(err, {}, res, () => {})
  return res
}

test('the catalog: every code has an HTTP error status and a message', () => {
  for (const [code, { status, message }] of Object.entries(ERROR_CODES)) {
    assert.match(code, /^[A-Z_]+$/)
    assert.ok(Number.isInteger(status) && status >= 400 && status < 600, code)
    assert.ok(message.length > 0, code)
  }
})

test('appError takes the status from the catalog and refuses unknown codes', () => {
  const error = appError('STEP_CONFLICT', 'Bước đã thay đổi.')
  assert.ok(error instanceof AppError && error instanceof HttpError)
  assert.deepEqual([error.status, error.code, error.message], [409, 'STEP_CONFLICT', 'Bước đã thay đổi.'])
  assert.equal(appError('NOT_FOUND').message, ERROR_CODES.NOT_FOUND.message)
  assert.equal(appError('INVALID_FILE', 'Quá lớn.', { status: 413 }).status, 413)
  assert.throws(() => appError('NO_SUCH_CODE'), /add it to errors\/codes\.js/)
})

test('toAppError maps database, parser and unknown errors', () => {
  const cases = [
    [pgError('23505'), 409, 'DUPLICATE'],
    [pgError('23503'), 409, 'INVALID_REFERENCE'],
    [pgError('22P02'), 400, 'INVALID_INPUT'],
    [pgError('23514'), 400, 'INVALID_INPUT'],
    [pgError('40P01'), 409, 'DATABASE_BUSY'],
    [pgError('57014'), 503, 'DATABASE_TIMEOUT'],
    [pgError('57P01'), 503, 'DATABASE_UNAVAILABLE'],
    [pgError('08006'), 503, 'DATABASE_UNAVAILABLE'],
    [Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), { code: 'ECONNREFUSED' }), 503, 'DATABASE_UNAVAILABLE'],
    [Object.assign(new Error('QueryFailedError'), { driverError: pgError('23505'), parameters: ['hash'] }), 409, 'DUPLICATE'],
    [Object.assign(new SyntaxError('Unexpected token'), { type: 'entity.parse.failed', status: 400 }), 400, 'INVALID_JSON'],
    [Object.assign(new Error('request entity too large'), { type: 'entity.too.large', status: 413 }), 413, 'PAYLOAD_TOO_LARGE'],
    [new AiUnavailableError('timeout'), 503, 'AI_UNAVAILABLE'],
    [new TypeError("Cannot read properties of undefined (reading 'id')"), 500, 'INTERNAL_ERROR'],
    [pgError('42P01'), 500, 'INTERNAL_ERROR'], // an unknown SQLSTATE is our bug, not the user's
  ]
  for (const [err, status, code] of cases) {
    const error = toAppError(err)
    assert.deepEqual([error.status, error.code], [status, code], err.message)
  }
})

test('several errors at once: the most severe one answers', () => {
  const refused = (port) => Object.assign(new Error(`connect ECONNREFUSED ::1:${port}`), { code: 'ECONNREFUSED' })
  assert.equal(toAppError(new AggregateError([refused(5432), refused(5433)])).code, 'DATABASE_UNAVAILABLE')
  const mixed = new AggregateError([appError('NOT_FOUND'), new Error('boom'), appError('STEP_CONFLICT')])
  assert.equal(toAppError(mixed).status, 500)
  assert.equal(toAppError(new AggregateError([appError('NOT_FOUND'), appError('STEP_CONFLICT')])).code, 'STEP_CONFLICT')
})

test('the response never carries a database message, detail or stack', () => {
  for (const err of [pgError('23505'), pgError('42P01'), Object.assign(new Error('x'), { driverError: pgError('23503'), parameters: ['secret-hash'] })]) {
    const { statusCode, body } = respond(err)
    const text = JSON.stringify(body)
    assert.ok(statusCode >= 400)
    assert.deepEqual(Object.keys(body.error).sort(), ['code', 'message'])
    assert.doesNotMatch(text, /secret|pg says|Key \(|stack/)
  }
  const validation = respond(appError('BAD_REQUEST', 'Bộ lọc không hợp lệ.', { details: [{ path: 'status', message: 'Invalid' }] }))
  assert.deepEqual(validation.body, { error: { code: 'BAD_REQUEST', message: 'Bộ lọc không hợp lệ.', details: [{ path: 'status', message: 'Invalid' }] } })
})

test('every appError code in the code base is in the catalog, and nothing builds errors by hand', () => {
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? walk(path.join(dir, entry.name)) : entry.name.endsWith('.js') ? [path.join(dir, entry.name)] : [])
  for (const file of walk(src)) {
    if (file.includes(`${path.sep}errors${path.sep}`)) continue
    const text = fs.readFileSync(file, 'utf8')
    for (const [, code] of text.matchAll(/appError\(\s*'([A-Z_]+)'/g)) assert.ok(ERROR_CODES[code], `${file}: ${code} is not in errors/codes.js`)
    assert.doesNotMatch(text, /new (?:HttpError|AppError)\(/, `${file}: use appError('CODE') from errors/index.js`)
  }
})
