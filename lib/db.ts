import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from '@/lib/schema'
import * as relations from '@/lib/schema/relations'

/**
 * Kết nối cơ sở dữ liệu.
 *
 * Dùng Drizzle thay Prisma: Prisma 7 biên dịch WASM lúc chạy, mà Cloudflare
 * Workers cấm điều đó (xem ADR-003). Drizzle sinh SQL thuần nên chạy được
 * ở cả Node lẫn Workers.
 *
 * Lúc chạy đi qua pooler (cổng 6543); chỉ migrate mới cần kết nối trực tiếp.
 */
function createPool() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('Thiếu biến môi trường DATABASE_URL')
  }

  return new Pool({
    connectionString,
    // Workers là môi trường ngắn hạn: mỗi yêu cầu một kết nối, đóng ngay.
    // Giữ pool lớn ở đây sẽ làm cạn hạn mức kết nối của Supabase.
    max: 1,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  })
}

// Next.js nạp lại module khi sửa mã trong lúc phát triển — giữ một pool duy
// nhất để không mở hàng chục kết nối thừa.
const globalForDb = globalThis as unknown as { pool: Pool | undefined }

const pool = globalForDb.pool ?? createPool()
if (process.env.NODE_ENV !== 'production') globalForDb.pool = pool

export const db = drizzle(pool, {
  schema: { ...schema, ...relations },
  casing: 'snake_case',
  logger: process.env.NODE_ENV === 'development',
})

export { schema }
