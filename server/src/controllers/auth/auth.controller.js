import * as authService from '../../services/auth/auth.service.js'

// POST /api/auth/login — body already validated; loginLimiter attached req.loginSucceeded/loginFailed.
export const login = async (req, res) => {
  try {
    const token = await authService.login(req.body.email, req.body.password)
    req.loginSucceeded()
    res.json({ token })
  } catch (error) {
    if (error.code === 'INVALID_CREDENTIALS') req.loginFailed()
    throw error
  }
}

// POST /api/auth/register
export const register = async (req, res) => {
  const token = await authService.register(req.body)
  res.status(201).json({ token })
}

// POST /api/auth/demo
export const demo = async (_req, res) => {
  const token = await authService.loginDemo()
  res.json({ token })
}

// GET /api/auth/me — req.auth set by requireAuth.
export const me = async (req, res) => {
  res.json(await authService.getSession(req.auth))
}
