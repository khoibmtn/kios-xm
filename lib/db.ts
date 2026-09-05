import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@/lib/generated/prisma/client'

/**
 * Prisma 7 yêu cầu driver adapter thay vì chuỗi kết nối trong schema.
 * Dùng pooler (cổng 6543) lúc chạy; migrate mới cần kết nối trực tiếp.
 */
function createClient() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('Thiếu biến môi trường DATABASE_URL')
  }

  const adapter = new PrismaPg({ connectionString })

  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === 'development'
        ? ['warn', 'error']
        : ['error'],
  })
}

// Trong dev, Next.js hot-reload sẽ tạo lại module -> giữ 1 instance toàn cục
// để không mở hàng chục connection pool.
const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createClient> | undefined
}

export const db = globalForPrisma.prisma ?? createClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db
}
