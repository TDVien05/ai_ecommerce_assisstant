import { api, authToken } from '@/lib/api'
import type { AuthApi, Session } from './types'

export const httpAuth: AuthApi = {
  async login(credentials) {
    const { token } = await api.post<{ token: string }>('/auth/login', credentials)
    authToken.set(token)
  },
  me: () => api.get<Session>('/auth/me'),
  logout: () => authToken.clear(),
}
