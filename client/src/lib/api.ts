// Single API client for the dashboard. All server calls go through here.
// In dev, Vite proxies /api and /health to http://localhost:4000 (same origin, no base URL).
// In production the API lives on another domain: VITE_API_BASE_URL (see client/.env.production).

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '')

export class ApiError extends Error {
  status: number
  code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

const TOKEN_KEY = 'auth_token'

export const authToken = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
}

type Query = Record<string, string | number | boolean | undefined | null>

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  query?: Query
  body?: unknown
  signal?: AbortSignal
}

function buildUrl(path: string, query?: Query) {
  if (!query) return path
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value))
  }
  const qs = params.toString()
  return qs ? `${path}?${qs}` : path
}

function headersFor(accept: string): Record<string, string> {
  const headers: Record<string, string> = { Accept: accept }
  const token = authToken.get()
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

async function checkResponse(res: Response, path: string) {
  if (res.ok) return
  const data = await res.json().catch(() => null)
  if (res.status === 401 && path.startsWith('/api/') && !['/api/auth/login', '/api/auth/register', '/api/auth/demo'].includes(path)) {
    authToken.clear()
    window.location.assign('/login')
  }
  throw new ApiError(res.status, data?.error?.code ?? 'HTTP_ERROR', data?.error?.message ?? 'Không thể kết nối máy chủ.')
}

async function request<T>(path: string, { method = 'GET', query, body, signal }: RequestOptions = {}): Promise<T> {
  const headers = headersFor('application/json')
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  const res = await fetch(API_BASE_URL + buildUrl(path, query), {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  })

  await checkResponse(res, path)
  const data = res.status === 204 ? null : await res.json().catch(() => null)
  return data as T
}

export const api = {
  get: <T>(path: string, query?: Query, signal?: AbortSignal) => request<T>(`/api${path}`, { query, signal }),
  post: <T>(path: string, body?: unknown) => request<T>(`/api${path}`, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(`/api${path}`, { method: 'PATCH', body }),
  delete: <T>(path: string) => request<T>(`/api${path}`, { method: 'DELETE' }),
  upload: async <T>(path: string, file: File): Promise<T> => {
    const fullPath = `/api${path}`
    const body = new FormData(); body.append('file', file)
    const res = await fetch(API_BASE_URL + fullPath, { method: 'POST', headers: headersFor('application/json'), body })
    await checkResponse(res, fullPath)
    return await res.json() as T
  },
  stream: async (path: string, signal: AbortSignal): Promise<ReadableStream<Uint8Array>> => {
    const fullPath = `/api${path}`
    const res = await fetch(API_BASE_URL + fullPath, { headers: headersFor('text/event-stream'), signal, cache: 'no-store' })
    await checkResponse(res, fullPath)
    if (!res.body || !res.headers.get('content-type')?.toLowerCase().startsWith('text/event-stream')) throw new Error('Dòng sự kiện không hợp lệ.')
    return res.body
  },

  health: (signal?: AbortSignal) => request<{ status: string; db: string }>('/health', { signal }),
}
