import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local', override: true })

import { Pool } from 'pg'

/**
 * Kiểm chứng các ràng buộc của ba bảng gói/liệu trình khách — customer_packages,
 * customer_package_items, package_transactions (drizzle/0009_customer_packages.sql)
 * — thực sự được cơ sở dữ liệu cưỡng chế, không chỉ nằm trên giấy.
 *
 * Một ràng buộc chưa từng thấy nó từ chối dữ liệu sai thì chưa chứng minh được
 * gì. Nhóm `mustReject` cố tình ghi sai và mong đợi bị chặn. Nhóm `mustHold`
 * dựng một chuỗi giao dịch thật rồi kiểm tra hai trigger
 * (`sync_customer_package_usage`, `sync_customer_package_status`) tính ra đúng
 * con số — đặc biệt công thức `used_sessions = tổng - SUM(quantity)`, vốn phải
 * tự xử lý đúng cả điều chỉnh dương (trả lại buổi) lẫn xoá giao dịch.
 *
 * An toàn: đây là cơ sở dữ liệu SẢN XUẤT đang chứa dữ liệu kinh doanh thật của
 * một spa. Mọi thao tác ghi nằm trong BEGIN...ROLLBACK — không COMMIT bất cứ
 * gì, không sửa hàng có sẵn, chỉ tạo hàng mới rồi rollback.
 */
const pool = new Pool({ connectionString: process.env.DIRECT_URL })

let pass = 0
let fail = 0

async function mustReject(label: string, sql: string, params: unknown[] = []) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(sql, params)
    await client.query('ROLLBACK')
    console.log(`  ✗ ${label} — LỌT QUA, đáng lẽ phải bị chặn`)
    fail++
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    // In kèm mã lỗi Postgres (SQLSTATE) để phân biệt "bị ràng buộc chặn đúng
    // chỗ" (23514/23503/23505) với "câu SQL của chính bài kiểm thử này sai".
    const code = (e as { code?: string }).code
    console.log(`  ✓ ${label} — bị chặn đúng như mong đợi${code ? ` (${code})` : ''}`)
    pass++
  } finally {
    client.release()
  }
}

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: mong đợi ${String(expected)}, thực tế ${String(actual)}`)
  }
}

async function mustHold(label: string, fn: () => Promise<void>) {
  try {
    await fn()
    console.log(`  ✓ ${label}`)
    pass++
  } catch (e) {
    console.log(`  ✗ ${label} — ${(e as Error).message}`)
    fail++
  }
}

async function main() {
  const tenantRes = await pool.query('SELECT id FROM tenants LIMIT 1')
  if (tenantRes.rows.length === 0) {
    console.log('Không có tenant nào trong cơ sở dữ liệu — bỏ qua toàn bộ kiểm thử.')
    await pool.end()
    return
  }
  const tenantId = tenantRes.rows[0].id

  const customerRes = await pool.query('SELECT id FROM customers LIMIT 1')
  const customerId: string | null = customerRes.rows[0]?.id ?? null
  if (!customerId) {
    console.log(
      'Cảnh báo: không có customer nào — bỏ qua các trường hợp cần dựng customer_packages.',
    )
  }

  const packageProductRes = await pool.query(
    `SELECT id FROM products WHERE kind = 'package' LIMIT 1`,
  )
  const packageProductId: string | null = packageProductRes.rows[0]?.id ?? null
  if (!packageProductId) {
    console.log('Cảnh báo: không có sản phẩm kind=package nào — package_id sẽ để NULL.')
  }

  const serviceProductRes = await pool.query(
    `SELECT id FROM products WHERE kind = 'service' LIMIT 1`,
  )
  const serviceProductId: string | null = serviceProductRes.rows[0]?.id ?? null
  if (!serviceProductId) {
    console.log('Cảnh báo: không có sản phẩm kind=service nào — service_id sẽ để NULL.')
  }

  // Hai CTE dùng chung: dựng một customer_packages (và customer_package_items)
  // tạm ngay trong CÙNG một câu lệnh với dòng cố tình ghi sai. Postgres coi cả
  // khối là MỘT statement — vế sau bị chặn thì vế dựng dữ liệu tạm cũng tự lùi
  // theo, không cần dọn dẹp riêng và không cần transaction lồng nhau.
  const pkgCte = `
    WITH pkg AS (
      INSERT INTO customer_packages (tenant_id, customer_id, package_id, code, package_name, sold_at)
      VALUES ($1, $2, $3, 'TMPPKG' || floor(random() * 1e9)::text, 'Gói kiểm thử', CURRENT_DATE)
      RETURNING id
    )
  `
  const pkgItemCte = `${pkgCte}, item AS (
      INSERT INTO customer_package_items (customer_package_id, service_id, service_name, sessions, allocated_per_session)
      SELECT pkg.id, $4, 'Dịch vụ kiểm thử', 10, 100000 FROM pkg
      RETURNING id
    )
  `
  const baseParams = [tenantId, customerId, packageProductId, serviceProductId]

  console.log('Ràng buộc trên customer_package_items:')
  if (!customerId) {
    console.log('  (bỏ qua — không có customer)')
  } else {
    await mustReject(
      'sessions = 0',
      `${pkgCte}
       INSERT INTO customer_package_items (customer_package_id, service_id, service_name, sessions, allocated_per_session)
       SELECT pkg.id, $4, 'Dịch vụ kiểm thử', 0, 100000 FROM pkg`,
      baseParams,
    )
    await mustReject(
      'sessions = -1',
      `${pkgCte}
       INSERT INTO customer_package_items (customer_package_id, service_id, service_name, sessions, allocated_per_session)
       SELECT pkg.id, $4, 'Dịch vụ kiểm thử', -1, 100000 FROM pkg`,
      baseParams,
    )
    await mustReject(
      'bonus_sessions = -1',
      `${pkgCte}
       INSERT INTO customer_package_items (customer_package_id, service_id, service_name, sessions, bonus_sessions, allocated_per_session)
       SELECT pkg.id, $4, 'Dịch vụ kiểm thử', 10, -1, 100000 FROM pkg`,
      baseParams,
    )
    await mustReject(
      'used_sessions vượt quá sessions + bonus_sessions (ghi thẳng vào cột)',
      `${pkgCte}
       INSERT INTO customer_package_items (customer_package_id, service_id, service_name, sessions, bonus_sessions, used_sessions, allocated_per_session)
       SELECT pkg.id, $4, 'Dịch vụ kiểm thử', 5, 0, 6, 100000 FROM pkg`,
      baseParams,
    )
    await mustReject(
      'used_sessions = -1',
      `${pkgCte}
       INSERT INTO customer_package_items (customer_package_id, service_id, service_name, sessions, used_sessions, allocated_per_session)
       SELECT pkg.id, $4, 'Dịch vụ kiểm thử', 5, -1, 100000 FROM pkg`,
      baseParams,
    )
  }

  console.log('\nRàng buộc trên package_transactions:')
  if (!customerId) {
    console.log('  (bỏ qua — không có customer)')
  } else {
    await mustReject(
      "type='grant' với quantity âm",
      `${pkgItemCte}
       INSERT INTO package_transactions (tenant_id, customer_package_item_id, type, quantity)
       SELECT $1, item.id, 'grant', -5 FROM item`,
      baseParams,
    )
    await mustReject(
      "type='use' với quantity dương",
      `${pkgItemCte}
       INSERT INTO package_transactions (tenant_id, customer_package_item_id, type, quantity)
       SELECT $1, item.id, 'use', 5 FROM item`,
      baseParams,
    )
    await mustReject(
      "type='use' với quantity = 0",
      `${pkgItemCte}
       INSERT INTO package_transactions (tenant_id, customer_package_item_id, type, quantity)
       SELECT $1, item.id, 'use', 0 FROM item`,
      baseParams,
    )
    await mustReject(
      "type='adjust' với quantity = 0",
      `${pkgItemCte}
       INSERT INTO package_transactions (tenant_id, customer_package_item_id, type, quantity)
       SELECT $1, item.id, 'adjust', 0 FROM item`,
      baseParams,
    )
    await mustReject(
      "type='adjust' với note để NULL",
      `${pkgItemCte}
       INSERT INTO package_transactions (tenant_id, customer_package_item_id, type, quantity, note)
       SELECT $1, item.id, 'adjust', 5, NULL FROM item`,
      baseParams,
    )
    await mustReject(
      "type='adjust' với note chỉ toàn khoảng trắng",
      `${pkgItemCte}
       INSERT INTO package_transactions (tenant_id, customer_package_item_id, type, quantity, note)
       SELECT $1, item.id, 'adjust', 5, '   ' FROM item`,
      baseParams,
    )
  }

  console.log('\nRàng buộc trên customer_packages:')
  if (!customerId) {
    console.log('  (bỏ qua ràng buộc UNIQUE — không có customer)')
  } else {
    const dupCode = `DUPTEST-${Date.now()}`
    await mustReject(
      'hai customer_packages cùng tenant_id và code',
      `WITH first AS (
         INSERT INTO customer_packages (tenant_id, customer_id, package_id, code, package_name, sold_at)
         VALUES ($1, $2, $3, $4, 'Gói kiểm thử 1', CURRENT_DATE)
         RETURNING id
       )
       INSERT INTO customer_packages (tenant_id, customer_id, package_id, code, package_name, sold_at)
       SELECT $1, $2, $3, $4, 'Gói kiểm thử 2', CURRENT_DATE FROM first`,
      [tenantId, customerId, packageProductId, dupCode],
    )
  }
  await mustReject(
    'customer_id trỏ tới uuid không tồn tại',
    `INSERT INTO customer_packages (tenant_id, customer_id, package_id, code, package_name, sold_at)
     VALUES ($1, gen_random_uuid(), $2, 'FKTEST' || floor(random() * 1e9)::text, 'Gói kiểm thử FK', CURRENT_DATE)`,
    [tenantId, packageProductId],
  )

  console.log('\nHành vi trigger khi dựng dữ liệu thật (A→F, cùng một gói, rồi rollback):')
  if (!customerId) {
    console.log('  (bỏ qua — không có customer)')
  } else {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      // Dựng dữ liệu nền tách riêng khỏi các mustHold bên dưới: nếu ngay việc
      // insert một item HỢP LỆ cũng làm trigger tự chết (ví dụ lỗi ép kiểu
      // enum trong sync_customer_package_status), ta cần bắt được nó ở đây và
      // báo rõ, thay vì để cả script sập không kịp in kết quả các nhóm khác.
      let packageId: string | undefined
      let itemId: string | undefined
      try {
        const pkgRes = await client.query(
          `INSERT INTO customer_packages (tenant_id, customer_id, package_id, code, package_name, sold_at, price)
           VALUES ($1, $2, $3, 'TRIGTEST' || floor(random() * 1e9)::text, 'Gói kiểm thử trigger', CURRENT_DATE, 1000000)
           RETURNING id`,
          [tenantId, customerId, packageProductId],
        )
        packageId = pkgRes.rows[0].id

        const itemRes = await client.query(
          `INSERT INTO customer_package_items (customer_package_id, service_id, service_name, sessions, bonus_sessions, allocated_per_session)
           VALUES ($1, $2, 'Dịch vụ kiểm thử trigger', 10, 0, 100000)
           RETURNING id`,
          [packageId, serviceProductId],
        )
        itemId = itemRes.rows[0].id
      } catch (e) {
        console.log(
          `  ✗ dựng dữ liệu nền (1 gói + 1 item hợp lệ) thất bại — ${(e as Error).message}`,
        )
        fail++
      }

      if (!packageId || !itemId) {
        console.log('  (bỏ qua A→F — không dựng được dữ liệu nền)')
      } else {
        const pkgId = packageId
        const itmId = itemId

        const insertTxn = (type: string, quantity: number, note: string | null = null) =>
          client.query(
            `INSERT INTO package_transactions (tenant_id, customer_package_item_id, type, quantity, note)
             VALUES ($1, $2, $3, $4, $5) RETURNING id`,
            [tenantId, itmId, type, quantity, note],
          )

        const getUsedSessions = async (): Promise<number> => {
          const r = await client.query(
            'SELECT used_sessions FROM customer_package_items WHERE id = $1',
            [itmId],
          )
          return r.rows[0].used_sessions
        }
        const getStatus = async (): Promise<string> => {
          const r = await client.query('SELECT status FROM customer_packages WHERE id = $1', [
            pkgId,
          ])
          return r.rows[0].status
        }

        // Cần giữ lại id của giao dịch use -3 (bước B) để xoá ở bước E.
        let use3TxnId: string | undefined

        await mustHold('A. grant +10 → used_sessions = 0', async () => {
          await insertTxn('grant', 10)
          assertEqual(await getUsedSessions(), 0, 'used_sessions')
        })

        await mustHold('B. use -3 → used_sessions = 3, status = active', async () => {
          const r = await insertTxn('use', -3)
          use3TxnId = r.rows[0].id
          assertEqual(await getUsedSessions(), 3, 'used_sessions')
          assertEqual(await getStatus(), 'active', 'status')
        })

        await mustHold('C. use -7 → used_sessions = 10, status = used_up', async () => {
          await insertTxn('use', -7)
          assertEqual(await getUsedSessions(), 10, 'used_sessions')
          assertEqual(await getStatus(), 'used_up', 'status')
        })

        await mustHold(
          'D. adjust +2 (có lý do) → used_sessions = 8, status quay lại active',
          async () => {
            await insertTxn('adjust', 2, 'trả lại buổi do máy hỏng')
            assertEqual(await getUsedSessions(), 8, 'used_sessions')
            assertEqual(await getStatus(), 'active', 'status')
          },
        )

        await mustHold('E. xoá giao dịch use -3 của bước B → used_sessions còn 5', async () => {
          if (!use3TxnId) throw new Error('không có giao dịch use -3 từ bước B để xoá')
          await client.query('DELETE FROM package_transactions WHERE id = $1', [use3TxnId])
          assertEqual(await getUsedSessions(), 5, 'used_sessions')
        })

        await mustHold(
          'F. status = cancelled rồi ghi thêm use → status vẫn là cancelled',
          async () => {
            await client.query(`UPDATE customer_packages SET status = 'cancelled' WHERE id = $1`, [
              pkgId,
            ])
            await insertTxn('use', -1)
            assertEqual(await getStatus(), 'cancelled', 'status')
          },
        )
      }
    } finally {
      await client.query('ROLLBACK').catch(() => {})
      client.release()
    }
  }

  console.log(`\nKết quả: ${pass} đúng, ${fail} sai`)
  await pool.end()
  if (fail > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
