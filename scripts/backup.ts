import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local', override: true })

import { execFile } from 'node:child_process'
import { gzipSync } from 'node:zlib'
import { promisify } from 'node:util'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { eq } from 'drizzle-orm'
import * as s from '../lib/schema'
import { decryptSecret } from '../lib/crypto'
import { GoogleDriveAdapter } from '../lib/storage/google-drive'

const run = promisify(execFile)

/**
 * Sao lưu cơ sở dữ liệu lên Google Drive.
 *
 * Vì sao chạy ở đây chứ không phải trên Cloudflare: `pg_dump` là chương trình
 * nhị phân của Postgres, Workers không chạy được. Kịch bản này chạy trên
 * GitHub Actions (xem `.github/workflows/backup.yml`), nơi có sẵn công cụ
 * Postgres và cũng miễn phí.
 *
 * Đây KHÔNG phải tính năng tuỳ chọn: Supabase gói miễn phí **không có bản sao
 * lưu nào**. Mất cơ sở dữ liệu là mất toàn bộ sổ sách của spa.
 */

const RETENTION_DAYS = Number(process.env.BACKUP_RETENTION_DAYS ?? 30)

async function main() {
  const started = Date.now()
  const connectionString = process.env.DIRECT_URL
  if (!connectionString) throw new Error('Thiếu DIRECT_URL')

  console.log('1) Kết xuất cơ sở dữ liệu')
  // --no-owner/--no-acl: bản sao lưu để khôi phục sang project khác cũng dùng được
  const { stdout } = await run(
    'pg_dump',
    [connectionString, '--no-owner', '--no-acl', '--format=plain'],
    { maxBuffer: 512 * 1024 * 1024, encoding: 'buffer' } as never,
  )
  const dump = stdout as unknown as Buffer
  console.log(`   → ${(dump.length / 1024 / 1024).toFixed(2)} MB chưa nén`)

  if (dump.length < 1024) {
    throw new Error('Bản kết xuất quá nhỏ, nhiều khả năng đã lỗi — dừng lại')
  }

  console.log('2) Nén')
  const gz = gzipSync(dump, { level: 9 })
  console.log(
    `   → ${(gz.length / 1024 / 1024).toFixed(2)} MB (giảm ${Math.round((1 - gz.length / dump.length) * 100)}%)`,
  )

  console.log('3) Lấy thông tin kết nối Drive')
  const pool = new Pool({ connectionString })
  const db = drizzle(pool, { casing: 'snake_case' })
  const [tenant] = await db.select().from(s.tenants).limit(1)
  const [settings] = await db
    .select()
    .from(s.tenantSettings)
    .where(eq(s.tenantSettings.tenantId, tenant.id))
    .limit(1)

  /*
   * Hai đường lấy refresh token, cố ý ưu tiên biến môi trường.
   *
   * Nếu bắt kịch bản này tự giải mã token trong cơ sở dữ liệu thì phải đưa
   * ENCRYPTION_KEY lên GitHub — mà khoá đó mở được MỌI dữ liệu nhạy cảm đã mã
   * hoá. Đưa riêng một refresh token của Drive lên thì phạm vi thiệt hại nhỏ
   * hơn hẳn nếu lộ, và thu hồi cũng dễ (chỉ cần bấm kết nối lại).
   */
  let refreshToken = process.env.GOOGLE_REFRESH_TOKEN
  if (!refreshToken) {
    if (!settings?.driveRefreshToken) {
      throw new Error('Chưa kết nối Google Drive — không có nơi cất bản sao lưu')
    }
    console.log('   → dùng token trong cơ sở dữ liệu (cần ENCRYPTION_KEY)')
    refreshToken = await decryptSecret(settings.driveRefreshToken)
  } else {
    console.log('   → dùng token từ biến môi trường')
  }

  const drive = new GoogleDriveAdapter({
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    refreshToken,
    rootFolderId: settings?.driveRootFolderId ?? undefined,
  })

  const now = new Date()
  const stamp = now.toISOString().slice(0, 19).replace(/[:T]/g, '-')
  const path = `backups/kios-xm_${stamp}.sql.gz`

  console.log('4) Tải lên Drive:', path)
  const meta = await drive.put({
    path,
    data: new Uint8Array(gz),
    mime: 'application/gzip',
  })
  console.log('   → fileId:', meta.externalId)

  console.log(`5) Dọn bản cũ hơn ${RETENTION_DAYS} ngày`)
  const files = await drive.list('backups')
  const cutoff = Date.now() - RETENTION_DAYS * 86_400_000
  let removed = 0
  for (const f of files) {
    if (new Date(f.createdTime).getTime() < cutoff) {
      await drive.delete(f.id)
      removed++
    }
  }
  console.log(`   → giữ lại ${files.length - removed}, đã xoá ${removed}`)

  await pool.end()
  console.log(`\nXong sau ${((Date.now() - started) / 1000).toFixed(1)}s`)
}

main().catch((e) => {
  console.error('SAO LƯU THẤT BẠI:', e instanceof Error ? e.message : e)
  process.exit(1)
})
