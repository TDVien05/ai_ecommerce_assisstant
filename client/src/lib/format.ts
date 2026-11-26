const vnd = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })

/** Format an integer VND amount, e.g. 250000 → "250.000 ₫". */
export const formatVND = (amount: number) => vnd.format(amount)
