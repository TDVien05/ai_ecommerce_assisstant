import { authToken } from '@/lib/api'
import type { AuthApi } from './types'

export const mockAuth: AuthApi = {
  async login({ email, password }) {
    if (!email.trim() || !password) throw new Error('Vui lòng nhập email và mật khẩu.')
    authToken.set(`mock:${email.trim().toLowerCase()}`)
  },
  async me() {
    const token = authToken.get()
    if (!token?.startsWith('mock:')) throw new Error('Phiên đăng nhập không hợp lệ.')
    return { user: { id: 'mock', email: token.slice(5) }, shop: { id: 'mock', name: 'Cửa hàng mẫu' } }
  },
  logout: () => authToken.clear(),
}
