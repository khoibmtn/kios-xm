import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local', override: true })

import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'
import { decryptSecret } from '../lib/crypto'
import { GoogleDriveAdapter } from '../lib/storage/google-drive'

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL! }) })

async function main() {
  const t = await db.tenant.findFirstOrThrow()
  const s = await db.tenantSettings.findUniqueOrThrow({ where: { tenantId: t.id } })

  const drive = new GoogleDriveAdapter({
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    refreshToken: await decryptSecret(s.driveRefreshToken!),
    rootFolderId: s.driveRootFolderId!,
  })

  console.log('1) Kiểm tra kết nối')
  const health = await drive.healthCheck()
  console.log('   →', health.ok ? 'OK' : 'LỖI', '·', health.message)
  if (!health.ok) process.exit(1)

  // Ảnh PNG 1x1 thật để chắc chắn mime và nội dung nhị phân đi đúng
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  )

  const path = `customers/2026/09/test-${Date.now()}.png`
  console.log('2) Tải lên:', path)
  const meta = await drive.put({ path, data: new Uint8Array(png), mime: 'image/png' })
  console.log('   → fileId:', meta.externalId, '· kích thước:', meta.size, 'byte')

  console.log('3) Ghi vào bảng files')
  const row = await db.storedFile.create({
    data: {
      tenantId: t.id,
      provider: drive.provider,
      externalId: meta.externalId,
      path: meta.path,
      mime: meta.mime,
      size: meta.size,
      checksum: meta.checksum,
    },
  })
  console.log('   → id:', row.id)

  console.log('4) Đọc lại từ Drive')
  const got = await drive.get(meta.externalId)
  const same = Buffer.from(got.data).equals(png)
  console.log('   → nội dung khớp:', same ? 'ĐÚNG' : 'SAI', '· mime:', got.mime)

  console.log('5) Dọn dẹp')
  await drive.delete(meta.externalId)
  await db.storedFile.delete({ where: { id: row.id } })
  console.log('   → đã xoá tệp thử')

  console.log('\nKẾT LUẬN: đường đi Drive thông suốt.')
  await db.$disconnect()
}

main().catch((e) => { console.error('THẤT BẠI:', e.message); process.exit(1) })
