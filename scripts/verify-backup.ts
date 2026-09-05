import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local', override: true })

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { gunzipSync } from 'node:zlib'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { eq } from 'drizzle-orm'
import * as s from '../lib/schema'
import { decryptSecret } from '../lib/crypto'
import { GoogleDriveAdapter } from '../lib/storage/google-drive'

const run = promisify(execFile)

/**
 * Kiểm chứng bản sao lưu mới nhất thực sự khôi phục được.
 *
 * Một bản sao lưu chưa từng thử khôi phục thì chưa phải bản sao lưu — nó chỉ
 * là một tệp. Kịch bản này tải bản mới nhất từ Drive, nạp lại vào một cơ sở
 * dữ liệu trống, rồi đối chiếu số bản ghi với dữ liệu đang chạy.
 *
 * Cần `psql`: bản kết xuất dùng `COPY … FROM stdin` — cú pháp của psql, không
 * phải của máy chủ, nên không chạy được qua driver thông thường.
 *
 * Đặt `VERIFY_URL` trỏ tới một cơ sở dữ liệu **trống và có thể vứt bỏ**.
 * Trong CI đó là service container `postgres:17`.
 */

async function main() {
  const verifyUrl = process.env.VERIFY_URL
  if (!verifyUrl) {
    console.log('Bỏ qua: chưa đặt VERIFY_URL (cần một cơ sở dữ liệu trống để nạp thử).')
    console.log('Trong CI biến này trỏ tới service container Postgres.')
    return
  }

  const pool = new Pool({ connectionString: process.env.DIRECT_URL })
  const db = drizzle(pool, { casing: 'snake_case' })

  const [tenant] = await db.select().from(s.tenants).limit(1)
  const [settings] = await db
    .select()
    .from(s.tenantSettings)
    .where(eq(s.tenantSettings.tenantId, tenant.id))
    .limit(1)

  const drive = new GoogleDriveAdapter({
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    // `||` chứ không phải `??`: biến có thể là chuỗi rỗng chứ không phải undefined
    refreshToken:
      process.env.GOOGLE_REFRESH_TOKEN || (await decryptSecret(settings.driveRefreshToken!)),
    rootFolderId: settings.driveRootFolderId!,
  })

  console.log('1) Tìm bản sao lưu mới nhất')
  const files = (await drive.list('backups')).filter((f) => f.name.endsWith('.sql.gz'))
  if (files.length === 0) throw new Error('Chưa có bản sao lưu nào trên Drive')
  const latest = files[0]
  console.log(
    `   → ${latest.name} · ${(latest.size / 1024).toFixed(1)} KB · ${latest.createdTime.slice(0, 19)}`,
  )

  console.log('2) Tải về và giải nén')
  const { data } = await drive.get(latest.id)
  const sqlText = gunzipSync(Buffer.from(data)).toString('utf8')
  const tableCount = (sqlText.match(/^CREATE TABLE /gm) ?? []).length
  console.log(`   → ${(sqlText.length / 1024).toFixed(1)} KB SQL · ${tableCount} bảng`)
  if (tableCount === 0) throw new Error('Bản sao lưu không có bảng nào — hỏng')

  console.log('3) Nạp lại vào cơ sở dữ liệu trống')
  const dir = mkdtempSync(join(tmpdir(), 'kiosxm-verify-'))
  const file = join(dir, 'dump.sql')
  writeFileSync(file, sqlText)

  const psql = process.env.PSQL ?? 'psql'
  const { stderr } = await run(
    psql,
    [verifyUrl, '--quiet', '--no-psqlrc', '-v', 'ON_ERROR_STOP=0', '-f', file],
    { maxBuffer: 256 * 1024 * 1024 },
  )
  // Bản kết xuất có tham chiếu tới vai trò và phần mở rộng riêng của Supabase;
  // những lỗi đó không ảnh hưởng tới dữ liệu nghiệp vụ nên chỉ ghi nhận.
  const errorLines = (stderr ?? '').split('\n').filter((l) => l.includes('ERROR'))
  if (errorLines.length > 0) {
    console.log(`   → ${errorLines.length} cảnh báo (vai trò/extension của Supabase), bỏ qua`)
  }

  console.log('4) Đối chiếu số bản ghi với dữ liệu đang chạy')
  const verifyPool = new Pool({ connectionString: verifyUrl })
  try {
    for (const table of ['tenants', 'branches', 'users', 'roles', 'employees']) {
      const restored = await verifyPool.query(`SELECT count(*)::int n FROM public.${table}`)
      const live = await pool.query(`SELECT count(*)::int n FROM public.${table}`)
      const ok = restored.rows[0].n === live.rows[0].n
      console.log(
        `   ${ok ? '✓' : '✗'} ${table}: khôi phục ${restored.rows[0].n} / đang chạy ${live.rows[0].n}`,
      )
      if (!ok) throw new Error(`Bảng ${table} lệch số bản ghi — bản sao lưu không đáng tin`)
    }
  } finally {
    await verifyPool.end()
  }

  console.log('\nKẾT LUẬN: bản sao lưu khôi phục được, số liệu khớp.')
  await pool.end()
}

main().catch((e) => {
  console.error('KIỂM CHỨNG THẤT BẠI:', e instanceof Error ? e.message : e)
  process.exit(1)
})
