import { createContext } from 'react'
import type { Credentials, Session } from '@/lib/auth/types'

export type AuthContextValue = { session: Session | null; loading: boolean; login: (credentials: Credentials) => Promise<void>; logout: () => void }
export const AuthContext = createContext<AuthContextValue | null>(null)
