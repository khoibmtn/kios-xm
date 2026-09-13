import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local', override: true })

import { execFile } from 'node:child_process'
import { gzipSync } from 'node:zlib'
import { promisify } from 'node:util'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { eq } from 'drizzle-orm'
import * as s from '../lib/schema'
import { driveForJobs } from './drive-adapter'

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
  let dump: Buffer
  try {
    const { stdout } = await run(
      // Cho phép chỉ định đường dẫn khi trên máy có nhiều bản Postgres
      process.env.PG_DUMP ?? 'pg_dump',
      [connectionString, '--no-owner', '--no-acl', '--format=plain'],
      { maxBuffer: 512 * 1024 * 1024, encoding: 'buffer' } as never,
    )
    dump = stdout as unknown as Buffer
  } catch (e) {
    // Thông báo mặc định chỉ nói "Command failed" và che mất chuỗi kết nối,
    // nên phải lấy stderr ra mới biết vì sao.
    const err = e as { stderr?: Buffer | string; message?: string }
    const detail = err.stderr
      ? Buffer.isBuffer(err.stderr)
        ? err.stderr.toString('utf8')
        : err.stderr
      : (err.message ?? '')
    throw new Error(`pg_dump lỗi:\n${detail.trim()}`)
  }
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

  const drive = await driveForJobs(settings)

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
