import bcrypt from 'bcrypt'
import { appError } from '../../errors/index.js'
import { passwordHashForOwner } from '../../repositories/auth/user.repository.js'
import { findDemoFlag } from '../../repositories/shop/shop.repository.js'

const attempts=new Map(), windowMs=15*60*1000, limit=5
export async function verifyOwnerPassword(auth,password,client) {
  if (typeof password!=='string' || !password) throw appError('BAD_REQUEST','Bạn cần nhập lại mật khẩu.')
  const shop=await findDemoFlag(auth.shopId,client)
  if (!shop || shop.is_demo) throw appError('TOOL_NOT_ALLOWED','Tài khoản demo không thể đổi tài khoản nhận tiền.')
  const now=Date.now(), key=`${auth.shopId}:${auth.userId}`
  for(const [item,value] of attempts) if(value.expires<=now) attempts.delete(item)
  const entry=attempts.get(key)??{count:0,expires:now+windowMs}
  if(entry.count>=limit)throw appError('TOO_MANY_ATTEMPTS','Bạn đã thử quá nhiều lần. Vui lòng thử lại sau 15 phút.')
  entry.count++;attempts.set(key,entry)
  const hash=await passwordHashForOwner(auth.shopId,auth.userId,client)
  if(!hash || !await bcrypt.compare(password,hash))throw appError('BAD_REQUEST','Mật khẩu không đúng.')
  if(attempts.get(key)===entry)attempts.delete(key)
}
