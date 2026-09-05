import 'dotenv/config'
import { config as loadEnv } from 'dotenv'
import { defineConfig, env } from 'prisma/config'

// Next.js đọc .env.local, còn Prisma CLI thì không — nạp thủ công.
loadEnv({ path: '.env.local', override: true })

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    // Chỉ dùng cho Prisma CLI (migrate/diff/studio) -> luôn là kết nối trực tiếp,
    // vì pooler pgbouncer không chạy được DDL và shadow database.
    // Lúc ứng dụng chạy thì dùng pooler qua adapter trong lib/db.ts.
    url: env('DIRECT_URL'),
  },
  migrations: {
    path: 'prisma/migrations',
  },
})
