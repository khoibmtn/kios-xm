import { config as loadEnv } from 'dotenv'
import { defineConfig } from 'drizzle-kit'

loadEnv({ path: '.env.local', override: true })

export default defineConfig({
  dialect: 'postgresql',
  schema: './lib/schema/index.ts',
  out: './drizzle',
  // DDL và introspect phải đi kết nối trực tiếp; pooler pgbouncer không chạy được.
  dbCredentials: {
    url: process.env.DIRECT_URL!,
  },
  casing: 'snake_case',
  verbose: true,
  strict: true,
})
