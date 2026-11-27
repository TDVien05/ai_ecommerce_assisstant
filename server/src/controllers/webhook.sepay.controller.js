import { HttpError } from '../lib/httpError.js'

// POST /webhooks/sepay — API key already checked by the route's middleware.
export const receive = () => {
  // TODO(M4): payment.service, following docs/PAYMENT_ANTI_SCAM.md.
  // Deliberately NOT returning 200 yet: a 2xx would tell SePay the transaction was handled.
  throw new HttpError(501, 'NOT_IMPLEMENTED', 'SePay webhook handling is not implemented yet')
}
