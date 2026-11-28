// All queries for the `users` table. See docs/ARCHITECTURE.md, section "Repositories".
// On TypeORM (models/auth/User.js), except create(), which must join the demo copy's pg transaction.
import { getRepository, transaction, query } from '../../config/database.js'
import { User } from '../../models/auth/User.js'
import { Shop } from '../../models/shop/Shop.js'

export async function passwordHashForOwner(shopId, userId, db) {
  const { rows } = await query('SELECT password_hash FROM users WHERE shop_id=$1 AND id=$2', [shopId,userId], db)
  return rows[0]?.password_hash ?? null
}

/** Login lookup: { id, shopId, email, passwordHash } or null. */
export const findByEmail = async (email) => {
  const users = await getRepository(User)
  return users.findOne({
    where: { email },
    select: { id: true, shopId: true, email: true, passwordHash: true },
  })
}

/** Session lookup: { id, email, ownerName, shopId, shopName, isDemo } or null. */
export const findWithShop = async (id) => {
  const users = await getRepository(User)
  const row = await users.createQueryBuilder('u')
    .innerJoin(Shop, 's', 's.id = u.shopId')
    .select('u.id', 'id')
    .addSelect('u.email', 'email')
    .addSelect('u.ownerName', 'ownerName')
    .addSelect('s.id', 'shopId')
    .addSelect('s.name', 'shopName')
    .addSelect('s.isDemo', 'isDemo')
    .where('u.id = :id', { id })
    .getRawOne()
  return row ?? null
}

/**
 * Registration: create the shop and its owner in one TypeORM transaction.
 * Returns { shopId, userId }. A taken email fails with code 23505 / constraint users_email_key.
 */
export const registerOwner = ({ shopName, email, passwordHash, ownerName }) => transaction(async (manager) => {
  const shop = await manager.getRepository(Shop).insert({ name: shopName })
  const shopId = shop.identifiers[0].id
  const user = await manager.getRepository(User).insert({ shopId, email, passwordHash, ownerName })
  return { shopId, userId: user.identifiers[0].id }
})

/** Demo owner, inside the caller's pg transaction (services/demo/demo.service.js). */
export async function create({ shopId, email, passwordHash, ownerName }, db) {
  const { rows } = await query(
    'INSERT INTO users (shop_id, email, password_hash, owner_name) VALUES ($1, $2, $3, $4) RETURNING id',
    [shopId, email, passwordHash, ownerName],
    db,
  )
  return rows[0]
}
