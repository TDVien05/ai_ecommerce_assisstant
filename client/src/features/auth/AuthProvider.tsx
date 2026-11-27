import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { auth } from '@/lib/auth'
import { authToken } from '@/lib/api'
import type { Credentials, Registration, Session } from '@/lib/auth/types'
import { AuthContext } from './context'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(() => Boolean(authToken.get()))
  const logout = useCallback(() => { auth.logout(); setSession(null) }, [])
  useEffect(() => {
    let active = true
    if (!authToken.get()) return
    auth.me().then((value) => { if (active) setSession(value) }).catch(() => { if (active) logout() }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [logout])
  const login = useCallback(async (credentials: Credentials) => {
    await auth.login(credentials)
    try { setSession(await auth.me()) } catch (error) { auth.logout(); throw error }
  }, [])
  const register = useCallback(async (data: Registration) => { await auth.register(data); try { setSession(await auth.me()) } catch (error) { auth.logout(); throw error } }, [])
  const demo = useCallback(async () => { await auth.demo(); try { setSession(await auth.me()) } catch (error) { auth.logout(); throw error } }, [])
  const value = useMemo(() => ({ session, loading, login, register, demo, logout }), [session, loading, login, register, demo, logout])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
