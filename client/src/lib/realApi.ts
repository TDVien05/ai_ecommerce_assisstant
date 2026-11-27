/** Danh sách mô-đun dùng API thật, phân cách bằng dấu phẩy. */
export function isReal(name: string): boolean {
  return (import.meta.env.VITE_REAL_API ?? '').split(',').some((item: string) => item.trim() === name)
}
