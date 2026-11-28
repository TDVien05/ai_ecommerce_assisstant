import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL

test('user repository on TypeORM: register, look up, duplicate email', { skip: !process.env.TEST_DATABASE_URL, timeout: 20000 }, async () => {
  const users = await import('../src/repositories/auth/user.repository.js')
  const { query, closeDatabase } = await import('../src/config/database.js')
  const email = `typeorm-${randomUUID()}@example.com`
  const shopName = `TypeORM ${randomUUID()}`
  try {
    const { shopId, userId } = await users.registerOwner({ shopName, email, passwordHash: 'hash-value', ownerName: 'Lan' })

    assert.deepEqual(await users.findByEmail(email), { id: userId, shopId, email, passwordHash: 'hash-value' })
    assert.deepEqual(await users.findWithShop(userId), { id: userId, email, ownerName: 'Lan', shopId, shopName, isDemo: false })
    assert.equal(await users.findByEmail(`missing-${email}`), null)
    assert.equal(await users.findWithShop(randomUUID()), null)

    // The same email again: the original pg error, and the second shop is rolled back.
    const otherShop = `TypeORM dup ${randomUUID()}`
    const failure = await users.registerOwner({ shopName: otherShop, email, passwordHash: 'secret-hash', ownerName: 'Mai' }).then(() => null, (error) => error)
    assert.equal(failure?.code, '23505')
    assert.equal(failure.constraint, 'users_email_key')
    // TypeORM's error carries the parameters; what the logger writes must not.
    const { logger } = await import('../src/lib/logger.js')
    const logged = JSON.stringify(logger[Symbol.for('pino.serializers')].err(failure))
    assert.doesNotMatch(logged, /secret-hash/)
    assert.match(logged, /users_email_key/)
    const { rowCount } = await query('SELECT 1 FROM shops WHERE name = $1', [otherShop])
    assert.equal(rowCount, 0, 'no orphan shop after a failed registration')
  } finally {
    await query('DELETE FROM shops WHERE id IN (SELECT shop_id FROM users WHERE email = $1)', [email])
    await closeDatabase()
  }
})
