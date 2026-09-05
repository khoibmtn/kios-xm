import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local', override: true })

import { Pool } from 'pg'

/**
 * Kiểm chứng các bất biến của danh mục thực sự được cơ sở dữ liệu cưỡng chế.
 *
 * Ràng buộc chỉ có giá trị nếu đã thấy nó từ chối dữ liệu sai. Mỗi trường hợp
 * dưới đây cố tình ghi sai và mong đợi bị chặn.
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
  } catch {
    await client.query('ROLLBACK').catch(() => {})
    console.log(`  ✓ ${label} — bị chặn đúng như mong đợi`)
    pass++
  } finally {
    client.release()
  }
}

async function mustAccept(label: string, sql: string, params: unknown[] = []) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(sql, params)
    await client.query('ROLLBACK')
    console.log(`  ✓ ${label} — được chấp nhận`)
    pass++
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    console.log(`  ✗ ${label} — BỊ CHẶN NHẦM: ${(e as Error).message}`)
    fail++
  } finally {
    client.release()
  }
}

async function main() {
  const t = await pool.query('SELECT id FROM tenants LIMIT 1')
  const tid = t.rows[0].id

  const ins = (cols: string, vals: string) =>
    `INSERT INTO products (tenant_id, code, name, ${cols}) VALUES ($1, 'TEST' || floor(random()*1e9)::text, 'Kiểm thử', ${vals})`

  console.log('Ràng buộc trên bảng hàng hoá:')
  await mustReject('dịch vụ không có thời lượng', ins('kind', `'service'`), [tid])
  await mustAccept('dịch vụ có thời lượng 90 phút', ins('kind, duration_minutes', `'service', 90`), [tid])
  await mustReject('dịch vụ thời lượng 0', ins('kind, duration_minutes', `'service', 0`), [tid])
  await mustReject('thẻ tài khoản không có mệnh giá', ins('kind', `'card'`), [tid])
  await mustAccept('thẻ có mệnh giá 5 triệu', ins('kind, card_face_value', `'card', 5000000`), [tid])
  await mustReject('dịch vụ mà bật theo dõi tồn kho', ins('kind, duration_minutes, track_inventory', `'service', 60, true`), [tid])
  await mustAccept('sản phẩm theo dõi tồn kho', ins('kind, track_inventory', `'product', true`), [tid])
  await mustReject('giá bán âm', ins('kind, base_price', `'product', -1`), [tid])
  await mustReject('hạn dùng theo ngày mà không có số ngày', ins('kind, card_face_value, validity_type', `'card', 100000, 'days'`), [tid])

  console.log('\nRàng buộc liên bảng (trigger):')
  const svc = await pool.query(
    `INSERT INTO products (tenant_id, code, name, kind, duration_minutes)
     VALUES ($1, 'TMPSVC', 'Dịch vụ tạm', 'service', 60) RETURNING id`, [tid])
  const prod = await pool.query(
    `INSERT INTO products (tenant_id, code, name, kind) VALUES ($1, 'TMPPRD', 'Sản phẩm tạm', 'product') RETURNING id`, [tid])
  const pkg = await pool.query(
    `INSERT INTO products (tenant_id, code, name, kind) VALUES ($1, 'TMPPKG', 'Gói tạm', 'package') RETURNING id`, [tid])

  await mustAccept('gói chứa dịch vụ',
    `INSERT INTO package_items (package_id, service_id, sessions, retail_price) VALUES ($1,$2,10,500000)`,
    [pkg.rows[0].id, svc.rows[0].id])
  await mustReject('gói chứa sản phẩm (phải là dịch vụ)',
    `INSERT INTO package_items (package_id, service_id, sessions, retail_price) VALUES ($1,$2,10,500000)`,
    [pkg.rows[0].id, prod.rows[0].id])
  await mustReject('dịch vụ đóng vai trò gói',
    `INSERT INTO package_items (package_id, service_id, sessions, retail_price) VALUES ($1,$2,10,500000)`,
    [svc.rows[0].id, svc.rows[0].id])
  await mustAccept('định mức: dịch vụ tiêu hao sản phẩm',
    `INSERT INTO service_materials (service_id, material_id, quantity) VALUES ($1,$2,2.5)`,
    [svc.rows[0].id, prod.rows[0].id])
  await mustReject('định mức: dịch vụ tiêu hao dịch vụ',
    `INSERT INTO service_materials (service_id, material_id, quantity) VALUES ($1,$2,1)`,
    [svc.rows[0].id, svc.rows[0].id])

  // dọn dữ liệu tạm
  await pool.query(`DELETE FROM products WHERE code IN ('TMPSVC','TMPPRD','TMPPKG')`)

  console.log(`\nKết quả: ${pass} đúng, ${fail} sai`)
  await pool.end()
  if (fail > 0) process.exit(1)
}

main().catch((e) => { console.error(e); process.exit(1) })
