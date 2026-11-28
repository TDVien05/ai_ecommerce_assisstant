// Symmetric encryption for secrets we must be able to read back (per-shop webhook secrets,
// Page tokens). AES-256-GCM: confidentiality + tamper detection.
//
// Ciphertext envelope: `v1:<iv base64>:<auth tag base64>:<data base64>`
// The key is derived from APP_ENCRYPTION_KEY, which therefore must not change while secrets
// are stored — rotating it requires re-encrypting every row.
import crypto from 'node:crypto'
import { env } from '../config/env.js'
import { appError } from '../errors/index.js'

const VERSION = 'v1'
const IV_BYTES = 12 // GCM standard nonce length

export function isEncryptionConfigured() {
  return Boolean(env.APP_ENCRYPTION_KEY)
}

function key() {
  if (!isEncryptionConfigured()) {
    throw appError('NOT_CONFIGURED', 'Chưa cấu hình APP_ENCRYPTION_KEY để lưu bí mật.')
  }
  // Any-length passphrase → exactly 32 bytes for aes-256-gcm.
  return crypto.createHash('sha256').update(env.APP_ENCRYPTION_KEY).digest()
}

/** Encrypt a secret for storage. Returns null for null/empty input. */
export function encryptSecret(plain) {
  if (plain === null || plain === undefined || plain === '') return null
  const iv = crypto.randomBytes(IV_BYTES)
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv)
  const data = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [VERSION, iv.toString('base64'), tag.toString('base64'), data.toString('base64')].join(':')
}

/** Decrypt a stored secret. Throws when the envelope was tampered with. */
export function decryptSecret(stored) {
  if (stored === null || stored === undefined || stored === '') return null
  const parts = String(stored).split(':')
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error('Unsupported secret envelope')
  }
  const [, iv, tag, data] = parts
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'))
  decipher.setAuthTag(Buffer.from(tag, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8')
}

/** Last four characters only, for display. */
export function maskSecret(secret) {
  if (!secret) return null
  const value = String(secret)
  return value.length <= 4 ? '****' : `****${value.slice(-4)}`
}
