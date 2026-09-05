import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local', override: true })

import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Pool } from 'pg'

/**
 * Áp các tệp SQL trong `drizzle/` theo thứ tự tên, bỏ qua tệp đã chạy.
 *
 * Trước đây các migration được chạy tay từng lần, nên chỉ mình tôi biết cái
 * nào đã áp — trong một thư mục làm việc chung với Antigravity thì đó là chỗ
 * hỏng chờ sẵn. Ghi lại lịch sử vào chính cơ sở dữ liệu để bất kỳ ai, bất kỳ
 * máy nào chạy lệnh này cũng ra cùng một trạng thái.
 *
 * Không dùng `drizzle-kit migrate` vì các tệp ở đây được viết tay (ràng buộc
 * CHECK, trigger, đổi tên cột) chứ không sinh từ diff lược đồ.
 *
 * Mỗi tệp chạy trong một giao dịch riêng: hỏng ở giữa thì tệp đó bị huỷ trọn
 * vẹn, những tệp trước vẫn giữ, và chạy lại chỉ tiếp tục từ chỗ hỏng.
 */
const pool = new Pool({ connectionString: process.env.DIRECT_URL })
const dir = join(process.cwd(), 'drizzle')

async function main() {
  const client = await pool.connect()
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS applied_migrations (
        name text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `)

    const { rows } = await client.query<{ name: string }>('SELECT name FROM applied_migrations')
    const applied = new Set(rows.map((r) => r.name))

    const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort()

    /*
     * `--baseline 0000_x.sql 0001_y.sql`: ghi nhận là đã áp mà không chạy lại.
     * Cần đúng một lần, cho những tệp đã chạy tay từ trước khi có kịch bản này
     * — chạy lại `CREATE TABLE` của tệp đầu sẽ hỏng ngay.
     */
    const baselineFlag = process.argv.indexOf('--baseline')
    if (baselineFlag !== -1) {
      const names = process.argv.slice(baselineFlag + 1).filter((a) => a.endsWith('.sql'))
      const unknown = names.filter((n) => !files.includes(n))
      if (unknown.length) throw new Error(`Không có tệp: ${unknown.join(', ')}`)

      for (const name of names) {
        await client.query(
          'INSERT INTO applied_migrations (name) VALUES ($1) ON CONFLICT DO NOTHING',
          [name],
        )
      }
      console.log(`Đã ghi nhận ${names.length} migration là áp sẵn: ${names.join(', ')}`)
      return
    }

    const pending = files.filter((f) => !applied.has(f))

    if (pending.length === 0) {
      console.log(`Không có migration mới (${files.length} tệp đã áp).`)
      return
    }

    for (const file of pending) {
      const sql = await readFile(join(dir, file), 'utf8')
      process.stdout.write(`→ ${file} … `)
      try {
        await client.query('BEGIN')
        await client.query(sql)
        await client.query('INSERT INTO applied_migrations (name) VALUES ($1)', [file])
        await client.query('COMMIT')
        console.log('xong')
      } catch (e) {
        await client.query('ROLLBACK')
        console.log('HỎNG')
        throw e
      }
    }

    console.log(`Đã áp ${pending.length} migration.`)
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
