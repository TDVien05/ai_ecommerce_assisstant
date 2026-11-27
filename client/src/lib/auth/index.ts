import { isReal } from '@/lib/realApi'
import { httpAuth } from './http'
import { mockAuth } from './mock'

export const auth = isReal('auth') ? httpAuth : mockAuth
