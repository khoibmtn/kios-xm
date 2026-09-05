import { cache } from 'react'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from '@/lib/schema'
import * as relations from '@/lib/schema/relations'

/**
 * Kết nối cơ sở dữ liệu.
 *
 * Dùng Drizzle thay Prisma vì Prisma 7 biên dịch WASM lúc chạy, mà Cloudflare
 * Workers cấm điều đó (ADR-003). Drizzle sinh SQL thuần nên chạy ở cả hai nơi.
 *
 * ⚠️ Trên Workers KHÔNG được giữ một pool dùng chung giữa các request. Worker
 * bị đóng băng giữa các lần gọi, kết nối TCP đứt, và request sau sẽ ném lỗi
 * "Worker threw exception". Vì vậy mỗi request tạo pool riêng với `maxUses: 1`
 * rồi bỏ. React `cache()` giới hạn phạm vi đúng trong một request, nên nhiều
 * lời gọi trong cùng trang vẫn dùng chung một kết nối.
 *
 * Ở môi trường phát triển (Node chạy liên tục) thì giữ pool toàn cục để
 * hot-reload không mở hàng chục kết nối thừa.
 */

function createDb() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('Thiếu biến môi trường DATABASE_URL')
  }

  const pool = new Pool({
    connectionString,
    max: 1,
    maxUses: 1,
    idleTimeoutMillis: 5_000,
    connectionTimeoutMillis: 10_000,
    allowExitOnIdle: true,
  })

  return drizzle(pool, {
    schema: { ...schema, ...relations },
    casing: 'snake_case',
  })
}

type Db = ReturnType<typeof createDb>

const globalForDb = globalThis as unknown as { db: Db | undefined }

/** Một kết nối cho mỗi request. */
const getRequestDb = cache(createDb)

function resolveDb(): Db {
  if (process.env.NODE_ENV === 'production') return getRequestDb()

  globalForDb.db ??= createDb()
  return globalForDb.db
}

/**
 * Ngoài mặt vẫn dùng như một đối tượng bình thường (`db.select()…`), nhưng bên
 * dưới mỗi lần chạm vào sẽ lấy kết nối đúng theo môi trường.
 */
export const db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    return Reflect.get(resolveDb(), prop, receiver)
  },
})

export { schema }
