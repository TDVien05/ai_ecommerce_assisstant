import { createContext } from 'react'
import type { Credentials, Registration, Session } from '@/lib/auth/types'

export type AuthContextValue = { session: Session | null; loading: boolean; login: (credentials: Credentials) => Promise<void>; register: (data: Registration) => Promise<void>; demo: () => Promise<void>; logout: () => void }
export const AuthContext = createContext<AuthContextValue | null>(null)
