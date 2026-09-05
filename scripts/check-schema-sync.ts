import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local', override: true })

import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core'
import * as schema from '../lib/schema'

/**
 * Bắt lệch giữa lược đồ Drizzle và cơ sở dữ liệu thật.
 *
 * Vì sao cần: `casing: 'snake_case'` trong `lib/db.ts` tự dịch khoá JS thành
 * tên cột, còn `drizzle-kit pull` chỉ ghi tên cột khi nó *khác* khoá JS. Hai
 * quy ước này khớp ở mọi cột, trừ đúng một cột lỡ đặt camelCase từ thời Prisma
 * — `employees.bankName`. Pull thấy tên trùng khoá nên bỏ trống, `casing` lại
 * dịch thành `bank_name`, và cơ sở dữ liệu không có cột nào tên thế. Không gì
 * phát hiện được: TypeScript hài lòng, `next build` hài lòng, kiểm thử đơn vị
 * không chạm cơ sở dữ liệu. Nó chỉ đổ khi người dùng bấm Lưu trên bản đã chạy.
 *
 * Cách kiểm tra: để chính Drizzle sinh câu `SELECT` mọi cột rồi `LIMIT 0`, và
 * bắt Postgres phán xử. Không đoán lại luật đặt tên — đi đúng đường mà mã thật
 * đi, nên không có kẽ hở giữa phép kiểm tra và thứ được kiểm tra.
 */
const pool = new Pool({ connectionString: process.env.DIRECT_URL, max: 1 })
const db = drizzle(pool, { casing: 'snake_case' })

function isTable(value: unknown): value is PgTable {
  return typeof value === 'object' && value !== null && Symbol.for('drizzle:Name') in value
}

/** Cùng luật `casing: 'snake_case'` mà Drizzle áp cho khoá JS khi không có tên cột. */
const snake = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()

async function main() {
  const problems: string[] = []
  const tables: PgTable[] = (Object.values(schema) as unknown[]).filter(isTable)

  // Vòng 1 — tên cột. Để Drizzle sinh câu SELECT mọi cột rồi LIMIT 0.
  for (const value of tables) {
    const name = getTableConfig(value).name

    try {
      await db.select().from(value).limit(0)
    } catch (e) {
      problems.push(`${name}: ${e instanceof Error ? e.message.split('\n')[0] : e}`)
    }
  }

  /*
   * Vòng 2 — giá trị mặc định. Với cột không được truyền giá trị, Drizzle gửi
   * từ khoá `DEFAULT`; cột NOT NULL mà cơ sở dữ liệu không có DEFAULT thật thì
   * `DEFAULT` nghĩa là NULL và câu chèn hỏng. `.defaultNow()` trong lược đồ chỉ
   * dùng lúc sinh DDL nên không cứu được — đúng cái đã làm hỏng lần chèn nhân
   * viên đầu tiên, và cũng sẽ hỏng với người dùng, chi nhánh, spa mới.
   *
   * Vòng 1 đã bảo đảm mọi tên cột phân giải được, nên tra cứu theo snake_case
   * ở đây không thể lệch âm thầm.
   */
  const { rows } = await pool.query<{
    table_name: string
    column_name: string
    has_default: boolean
  }>(
    `SELECT table_name, column_name, column_default IS NOT NULL AS has_default
       FROM information_schema.columns
      WHERE table_schema = 'public' AND is_nullable = 'NO'`,
  )
  const hasDefault = new Map(rows.map((r) => [`${r.table_name}.${r.column_name}`, r.has_default]))

  for (const value of tables) {
    const table = getTableConfig(value)

    for (const column of table.columns) {
      if (!column.notNull || !column.hasDefault) continue
      const key = `${table.name}.${snake(column.name)}`
      if (hasDefault.get(key) === false) {
        problems.push(
          `${key}: lược đồ khai có giá trị mặc định nhưng cơ sở dữ liệu thì không — ` +
            'mọi lần chèn vào bảng này sẽ vi phạm NOT NULL',
        )
      }
    }
  }

  await pool.end()

  console.log(`Đã đối chiếu ${tables.length} bảng: tên cột và giá trị mặc định.`)

  if (problems.length === 0) {
    console.log('Lược đồ khớp cơ sở dữ liệu.')
    return
  }

  console.error(`\n${problems.length} chỗ lệch:`)
  for (const p of problems) console.error(`  ✗ ${p}`)
  process.exitCode = 1
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
