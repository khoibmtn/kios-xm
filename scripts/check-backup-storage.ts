import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local', override: true })

import { gzipSync } from 'node:zlib'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { eq } from 'drizzle-orm'
import * as s from '../lib/schema'
import { decryptSecret } from '../lib/crypto'
import { GoogleDriveAdapter } from '../lib/storage/google-drive'

/**
 * Kiểm chứng phần lưu trữ của luồng sao lưu mà không cần pg_dump.
 * Bước kết xuất cơ sở dữ liệu chạy trên GitHub Actions, nơi có sẵn công cụ Postgres.
 */
const pool = new Pool({ connectionString: process.env.DIRECT_URL })
const db = drizzle(pool, { casing: 'snake_case' })

async function main() {
  const [tenant] = await db.select().from(s.tenants).limit(1)
  const [settings] = await db
    .select().from(s.tenantSettings)
    .where(eq(s.tenantSettings.tenantId, tenant.id)).limit(1)

  const drive = new GoogleDriveAdapter({
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    refreshToken: await decryptSecret(settings.driveRefreshToken!),
    rootFolderId: settings.driveRootFolderId!,
  })

  const fake = Buffer.from(
    '-- bản kết xuất giả lập để kiểm thử\nCREATE TABLE thu (id int);\n'.repeat(500),
  )
  const gz = gzipSync(fake, { level: 9 })
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
  const path = `backups/KIEMTHU_${stamp}.sql.gz`

  console.log('1) Tải bản sao lưu lên:', path)
  const meta = await drive.put({ path, data: new Uint8Array(gz), mime: 'application/gzip' })
  console.log(`   → ${meta.externalId} · ${(meta.size / 1024).toFixed(1)} KB`)

  console.log('2) Liệt kê thư mục backups')
  const files = await drive.list('backups')
  console.log(`   → ${files.length} tệp:`)
  for (const f of files.slice(0, 5)) {
    console.log(`      ${f.name} · ${(f.size / 1024).toFixed(1)} KB · ${f.createdTime.slice(0, 19)}`)
  }

  console.log('3) Kiểm tra logic dọn bản cũ (mốc 30 ngày)')
  const cutoff = Date.now() - 30 * 86_400_000
  const expired = files.filter((f) => new Date(f.createdTime).getTime() < cutoff)
  console.log(`   → ${expired.length} tệp quá hạn cần xoá`)

  console.log('4) Dọn tệp kiểm thử vừa tạo')
  await drive.delete(meta.externalId)
  console.log('   → đã xoá')

  console.log('\nKẾT LUẬN: phần lưu trữ của luồng sao lưu hoạt động.')
  await pool.end()
}

main().catch((e) => {
  console.error('THẤT BẠI:', e instanceof Error ? e.message : e)
  process.exit(1)
})
