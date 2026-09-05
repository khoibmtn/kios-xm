import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local', override: true })

import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { eq } from 'drizzle-orm'
import * as s from '../lib/schema'
import { decryptSecret } from '../lib/crypto'
import { GoogleDriveAdapter } from '../lib/storage/google-drive'

const pool = new Pool({ connectionString: process.env.DIRECT_URL })
const db = drizzle(pool, { casing: 'snake_case' })

async function main() {
  const [tenant] = await db.select().from(s.tenants).limit(1)
  const [settings] = await db
    .select()
    .from(s.tenantSettings)
    .where(eq(s.tenantSettings.tenantId, tenant.id))
    .limit(1)

  const drive = new GoogleDriveAdapter({
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    refreshToken: await decryptSecret(settings.driveRefreshToken!),
    rootFolderId: settings.driveRootFolderId!,
  })

  console.log('1) Kiểm tra kết nối')
  const health = await drive.healthCheck()
  console.log('   →', health.ok ? 'OK' : 'LỖI', '·', health.message)
  if (!health.ok) process.exit(1)

  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  )

  const path = `customers/2026/09/test-${Date.now()}.png`
  console.log('2) Tải lên:', path)
  const meta = await drive.put({ path, data: new Uint8Array(png), mime: 'image/png' })
  console.log('   → fileId:', meta.externalId, '· kích thước:', meta.size, 'byte')

  console.log('3) Ghi vào bảng files')
  const [row] = await db
    .insert(s.files)
    .values({
      tenantId: tenant.id,
      provider: drive.provider,
      externalId: meta.externalId,
      path: meta.path,
      mime: meta.mime,
      size: meta.size,
      checksum: meta.checksum,
    })
    .returning()
  console.log('   → id:', row.id)

  console.log('4) Đọc lại từ Drive')
  const got = await drive.get(meta.externalId)
  console.log(
    '   → nội dung khớp:',
    Buffer.from(got.data).equals(png) ? 'ĐÚNG' : 'SAI',
    '· mime:',
    got.mime,
  )

  console.log('5) Dọn dẹp')
  await drive.delete(meta.externalId)
  await db.delete(s.files).where(eq(s.files.id, row.id))
  console.log('   → đã xoá tệp thử')

  console.log('\nKẾT LUẬN: đường đi Drive thông suốt.')
}

main()
  .catch((e) => {
    console.error('THẤT BẠI:', e.message)
    process.exit(1)
  })
  .finally(() => pool.end())
