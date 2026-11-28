import { env } from '../config/env.js'

// CORS for the dashboard when it is served from another origin (production: Vercel FE → Railway API).
// In dev the Vite proxy makes requests same-origin, so these headers are unused there.
// Auth is a Bearer token (no cookies), so credentials are not allowed.
export function cors(req, res, next) {
  res.append('Vary', 'Origin')
  const origin = req.get('Origin')
  if (origin && env.CORS_ORIGIN.includes(origin)) {
    res.set('Access-Control-Allow-Origin', origin)
    res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type')
    res.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS')
    res.set('Access-Control-Max-Age', '600')
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
}
