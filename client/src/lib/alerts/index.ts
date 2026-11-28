import { mockAlerts } from './mock'
import { httpAlerts } from './http'
import { isReal } from '@/lib/realApi'
import type { AlertsApi } from './types'
export const alertsApi: AlertsApi = isReal('alerts') ? httpAlerts : mockAlerts
export * from './types'
