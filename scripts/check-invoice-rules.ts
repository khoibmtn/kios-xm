import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local', override: true })

import { Pool } from 'pg'

/**
 * Kiểm chứng ràng buộc và bất biến của hoá đơn — `invoices`, `invoice_items`,
 * `invoice_item_employees`, `payments`, `cash_transactions`
 * (`drizzle/0012_invoices.sql`).
 *
 * Bất biến quan trọng nhất ở đây không phải "chặn dữ liệu sai" mà là **hoá đơn
 * và sổ quỹ luôn khớp**: mỗi lần thanh toán phải sinh đúng một phiếu thu, và
 * hai con số cache (`invoices.paid_amount`, `cash_accounts.balance`) phải bám
 * theo. Ba thứ đó chỉ chứng minh được bằng cách **dựng dữ liệu đúng rồi đếm**
 * — nhóm `mustHold` bên dưới.
 *
 * An toàn: cơ sở dữ liệu SẢN XUẤT. Mọi thao tác ghi trong BEGIN…ROLLBACK,
 * không COMMIT bất cứ gì.
 */
const pool = new Pool({ connectionString: process.env.DIRECT_URL })

let pass = 0
let fail = 0

const CONSTRAINT_CODES = new Set(['23P01', '23514', '23505', '23503'])

async function mustReject(label: string, statements: [string, unknown[]][]) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    for (let i = 0; i < statements.length; i++) {
      const [sql, params] = statements[i]
      try {
        await client.query(sql, params)
      } catch (e) {
        const code = (e as { code?: string }).code ?? ''
        if (i < statements.length - 1) {
          console.log(
            `  ✗ ${label} — câu dựng nền #${i + 1} hỏng (${code}): ${(e as Error).message}`,
          )
          fail++
          return
        }
        if (!CONSTRAINT_CODES.has(code)) {
          console.log(`  ✗ ${label} — bị chặn nhưng KHÔNG do ràng buộc (${code})`)
          fail++
          return
        }
        console.log(`  ✓ ${label} — bị chặn đúng như mong đợi (${code})`)
        pass++
        return
      }
    }
    console.log(`  ✗ ${label} — LỌT QUA, đáng lẽ phải bị chặn`)
    fail++
  } finally {
    await client.query('ROLLBACK').catch(() => {})
    client.release()
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

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (String(actual) !== String(expected)) {
    throw new Error(`${label}: mong đợi ${String(expected)}, thực tế ${String(actual)}`)
  }
}

async function main() {
  const one = async (sql: string): Promise<string | null> =>
    (await pool.query(sql)).rows[0]?.id ?? null

  const tenantId = await one('SELECT id FROM tenants LIMIT 1')
  const branchId = await one('SELECT id FROM branches LIMIT 1')
  const userId = await one('SELECT id FROM users LIMIT 1')
  const customerId = await one('SELECT id FROM customers LIMIT 1')
  const employeeId = await one('SELECT id FROM employees LIMIT 1')
  const productId = await one(`SELECT id FROM products WHERE kind = 'product' LIMIT 1`)
  const cashId = await one(`SELECT id FROM cash_accounts WHERE kind = 'cash' LIMIT 1`)

  if (!tenantId || !branchId || !customerId) {
    console.log('Thiếu dữ liệu nền — bỏ qua toàn bộ kiểm thử.')
    await pool.end()
    return
  }
  if (!cashId) console.log('Cảnh báo: chưa có quỹ tiền mặt — bỏ qua nhóm sổ quỹ.')

  const INV = '44444444-4444-4444-8444-444444444444'
  const ITEM = '55555555-5555-4555-8555-555555555555'

  const mkInvoice = (extra = '', params: unknown[] = []): [string, unknown[]] => [
    `INSERT INTO invoices (id, tenant_id, branch_id, customer_id, code, created_by_user_id${extra ? ', ' + extra.split('=')[0] : ''})
     VALUES ($1,$2,$3,$4,'ZZZ-HD',$5${extra ? ', ' + extra.split('=')[1] : ''})`,
    [INV, tenantId, branchId, customerId, userId, ...params],
  ]

  const mkItem = (cols = '', vals = ''): [string, unknown[]] => [
    `INSERT INTO invoice_items (id, invoice_id, tenant_id, product_id, product_name${cols ? ', ' + cols : ''})
     VALUES ($1,$2,$3,$4,'Hàng kiểm thử'${vals ? ', ' + vals : ''})`,
    [ITEM, INV, tenantId, productId],
  ]

  console.log('\nHoá đơn:')
  await mustReject('không có khách lẫn tên khách vãng lai', [
    [
      `INSERT INTO invoices (tenant_id, branch_id, code) VALUES ($1,$2,'ZZZ1')`,
      [tenantId, branchId],
    ],
  ])
  await mustReject('tổng tiền âm', [
    [
      `INSERT INTO invoices (tenant_id, branch_id, customer_id, code, total)
       VALUES ($1,$2,$3,'ZZZ2',-1)`,
      [tenantId, branchId, customerId],
    ],
  ])
  await mustReject('giảm giá hoá đơn trên 100%', [
    [
      `INSERT INTO invoices (tenant_id, branch_id, customer_id, code, discount_ratio)
       VALUES ($1,$2,$3,'ZZZ3',120)`,
      [tenantId, branchId, customerId],
    ],
  ])
  await mustReject('huỷ hoá đơn mà không ghi lý do', [
    [
      `INSERT INTO invoices (tenant_id, branch_id, customer_id, code, status, cancelled_at)
       VALUES ($1,$2,$3,'ZZZ4','cancelled',now())`,
      [tenantId, branchId, customerId],
    ],
  ])
  await mustReject('hai hoá đơn cùng mã', [
    [
      `INSERT INTO invoices (tenant_id, branch_id, customer_id, code)
       VALUES ($1,$2,$3,'ZZZ5'),($1,$2,$3,'ZZZ5')`,
      [tenantId, branchId, customerId],
    ],
  ])

  console.log('\nDòng hàng:')
  await mustReject('số lượng bằng 0', [mkInvoice(), mkItem('quantity', '0')])
  await mustReject('đơn giá âm', [mkInvoice(), mkItem('unit_price', '-1000')])
  await mustReject('giảm giá dòng trên 100%', [mkInvoice(), mkItem('discount_ratio', '150')])

  console.log('\nMột buổi đã hẹn chỉ được bán một lần (§3b.2):')
  const bookingSetup: [string, unknown[]][] = [
    [
      `INSERT INTO bookings (id, tenant_id, branch_id, customer_id, code, created_by_user_id)
       VALUES ('66666666-6666-4666-8666-666666666666',$1,$2,$3,'ZZZ-LH',$4)`,
      [tenantId, branchId, customerId, userId],
    ],
    [
      `INSERT INTO booking_items (id, booking_id, tenant_id, service_name, starts_at, ends_at)
       VALUES ('77777777-7777-4777-8777-777777777777','66666666-6666-4666-8666-666666666666',$1,
               'Dịch vụ kiểm thử','2030-04-01T02:00:00Z','2030-04-01T03:00:00Z')`,
      [tenantId],
    ],
    mkInvoice(),
  ]
  await mustReject('hai dòng hoá đơn cùng trỏ vào một booking_item', [
    ...bookingSetup,
    [
      `INSERT INTO invoice_items (invoice_id, tenant_id, product_name, booking_item_id)
       VALUES ($1,$2,'Lần 1','77777777-7777-4777-8777-777777777777'),
              ($1,$2,'Lần 2','77777777-7777-4777-8777-777777777777')`,
      [INV, tenantId],
    ],
  ])

  console.log('\nThanh toán:')
  await mustReject('số tiền bằng 0', [
    mkInvoice(),
    [
      `INSERT INTO payments (tenant_id, invoice_id, code, method, amount)
       VALUES ($1,$2,'ZZZ-TT','cash',0)`,
      [tenantId, INV],
    ],
  ])
  await mustReject('hai phiếu thanh toán cùng mã', [
    mkInvoice(),
    [
      `INSERT INTO payments (tenant_id, invoice_id, code, method, amount)
       VALUES ($1,$2,'ZZZ-TT2','cash',1000),($1,$2,'ZZZ-TT2','cash',2000)`,
      [tenantId, INV],
    ],
  ])

  if (employeeId) {
    console.log('\nHoa hồng:')
    await mustReject('tỷ lệ đóng góp bằng 0', [
      mkInvoice(),
      mkItem(),
      [
        `INSERT INTO invoice_item_employees (invoice_item_id, employee_id, role, contribution_ratio)
         VALUES ($1,$2,'performer',0)`,
        [ITEM, employeeId],
      ],
    ])
    await mustReject('tỷ lệ đóng góp trên 1', [
      mkInvoice(),
      mkItem(),
      [
        `INSERT INTO invoice_item_employees (invoice_item_id, employee_id, role, contribution_ratio)
         VALUES ($1,$2,'performer',1.5)`,
        [ITEM, employeeId],
      ],
    ])
    await mustReject('cùng nhân viên, cùng vai trò, trên cùng một dòng', [
      mkInvoice(),
      mkItem(),
      [
        `INSERT INTO invoice_item_employees (invoice_item_id, employee_id, role)
         VALUES ($1,$2,'performer'),($1,$2,'performer')`,
        [ITEM, employeeId],
      ],
    ])
  }

  // ───────────── Nhóm hai: bất biến hoá đơn ⇄ sổ quỹ ─────────────

  console.log('\nHoá đơn ⇄ sổ quỹ (dựng thật rồi rollback):')
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const setup = async () => {
      await client.query(
        `INSERT INTO invoices (id, tenant_id, branch_id, customer_id, code, total, created_by_user_id)
         VALUES ($1,$2,$3,$4,'ZZZ-HD',500000,$5)`,
        [INV, tenantId, branchId, customerId, userId],
      )
    }
    const pay = async (code: string, amount: number) =>
      (
        await client.query(
          `INSERT INTO payments (tenant_id, invoice_id, code, method, amount, cash_account_id, created_by_user_id)
           VALUES ($1,$2,$3,'cash',$4,$5,$6) RETURNING id`,
          [tenantId, INV, code, amount, cashId, userId],
        )
      ).rows[0].id as string

    const num = async (sql: string, params: unknown[] = []) =>
      (await client.query(sql, params)).rows[0]?.n

    if (cashId) {
      await mustHold('thanh toán sinh đúng một phiếu thu, mã trùng mã thanh toán', async () => {
        await client.query('SAVEPOINT s')
        await setup()
        await pay('ZZZ-TT-A', 200000)
        const n = await num(
          `SELECT count(*)::int AS n FROM cash_transactions
           WHERE invoice_id=$1 AND direction='in' AND code='ZZZ-TT-A' AND amount=200000`,
          [INV],
        )
        assertEqual(n, 1, 'số phiếu thu sinh ra')
        await client.query('ROLLBACK TO SAVEPOINT s')
      })

      await mustHold('paid_amount bám theo tổng các lần thanh toán', async () => {
        await client.query('SAVEPOINT s')
        await setup()
        await pay('ZZZ-TT-B1', 200000)
        assertEqual(
          await num(`SELECT paid_amount AS n FROM invoices WHERE id=$1`, [INV]),
          '200000.00',
          'sau lần trả thứ nhất',
        )
        await pay('ZZZ-TT-B2', 300000)
        assertEqual(
          await num(`SELECT paid_amount AS n FROM invoices WHERE id=$1`, [INV]),
          '500000.00',
          'sau lần trả thứ hai',
        )
        await client.query('ROLLBACK TO SAVEPOINT s')
      })

      await mustHold('số dư quỹ bám theo phiếu thu', async () => {
        await client.query('SAVEPOINT s')
        const before = await num(`SELECT balance AS n FROM cash_accounts WHERE id=$1`, [cashId])
        await setup()
        await pay('ZZZ-TT-C', 250000)
        const after = await num(`SELECT balance AS n FROM cash_accounts WHERE id=$1`, [cashId])
        assertEqual(Number(after) - Number(before), 250000, 'chênh lệch số dư')
        await client.query('ROLLBACK TO SAVEPOINT s')
      })

      await mustHold('xoá thanh toán thì phiếu thu và hai cache đều lùi theo', async () => {
        await client.query('SAVEPOINT s')
        const before = await num(`SELECT balance AS n FROM cash_accounts WHERE id=$1`, [cashId])
        await setup()
        const id = await pay('ZZZ-TT-D', 400000)
        await client.query(`DELETE FROM payments WHERE id=$1`, [id])
        assertEqual(
          await num(`SELECT count(*)::int AS n FROM cash_transactions WHERE payment_id=$1`, [id]),
          0,
          'phiếu thu còn lại',
        )
        assertEqual(
          await num(`SELECT paid_amount AS n FROM invoices WHERE id=$1`, [INV]),
          '0.00',
          'paid_amount',
        )
        assertEqual(
          await num(`SELECT balance AS n FROM cash_accounts WHERE id=$1`, [cashId]),
          before,
          'số dư quỹ',
        )
        await client.query('ROLLBACK TO SAVEPOINT s')
      })
    }

    await mustHold('hoá đơn tổng tiền 0 là hợp lệ (dùng buổi từ gói)', async () => {
      await client.query('SAVEPOINT s')
      await client.query(
        `INSERT INTO invoices (tenant_id, branch_id, customer_id, code, total, service_allocated_value)
         VALUES ($1,$2,$3,'ZZZ-HD0',0,1000000)`,
        [tenantId, branchId, customerId],
      )
      await client.query('ROLLBACK TO SAVEPOINT s')
    })

    await mustHold('nhiều dòng hàng không gắn lịch hẹn vẫn cùng tồn tại được', async () => {
      await client.query('SAVEPOINT s')
      await setup()
      await client.query(
        `INSERT INTO invoice_items (invoice_id, tenant_id, product_name)
         VALUES ($1,$2,'Hàng A'),($1,$2,'Hàng B')`,
        [INV, tenantId],
      )
      await client.query('ROLLBACK TO SAVEPOINT s')
    })

    /*
     * Nhóm quan trọng nhất của cả tệp: huỷ hoá đơn phải **hoàn buổi lại cho
     * khách** và **đảo phiếu thu**, bằng bút toán ngược chứ không xoá gì.
     * Trước migration 0013, xoá hoá đơn còn không hoàn buổi mà chẳng ai báo.
     */
    const pkgItemId = (
      await client.query(
        `SELECT id, sessions + bonus_sessions - used_sessions AS con
         FROM customer_package_items
         WHERE sessions + bonus_sessions - used_sessions > 0 LIMIT 1`,
      )
    ).rows[0]

    if (pkgItemId && cashId) {
      await mustHold('huỷ hoá đơn → hoàn buổi về gói và đảo phiếu thu', async () => {
        await client.query('SAVEPOINT s')
        const conTruoc = Number(pkgItemId.con)
        const quyTruoc = Number(
          (await client.query(`SELECT balance FROM cash_accounts WHERE id=$1`, [cashId])).rows[0]
            .balance,
        )

        // Bán: 1 buổi từ gói + thu 100.000
        await client.query(
          `INSERT INTO invoices (id, tenant_id, branch_id, customer_id, code, total, service_allocated_value, status)
           VALUES ($1,$2,$3,$4,'ZZZ-HUY',100000,500000,'completed')`,
          [INV, tenantId, branchId, customerId],
        )
        const itemId = (
          await client.query(
            `INSERT INTO invoice_items (invoice_id, tenant_id, product_name, quantity,
               customer_package_item_id, allocated_value)
             VALUES ($1,$2,'Buổi từ gói',1,$3,500000) RETURNING id`,
            [INV, tenantId, pkgItemId.id],
          )
        ).rows[0].id
        await client.query(
          `INSERT INTO package_transactions (tenant_id, customer_package_item_id, type, quantity,
             allocated_value, invoice_item_id)
           VALUES ($1,$2,'use',-1,500000,$3)`,
          [tenantId, pkgItemId.id, itemId],
        )
        await client.query(
          `INSERT INTO payments (tenant_id, invoice_id, code, method, amount, cash_account_id)
           VALUES ($1,$2,'ZZZ-TT-H','cash',100000,$3)`,
          [tenantId, INV, cashId],
        )

        const conSauBan = Number(
          (
            await client.query(
              `SELECT sessions + bonus_sessions - used_sessions AS n
               FROM customer_package_items WHERE id=$1`,
              [pkgItemId.id],
            )
          ).rows[0].n,
        )
        assertEqual(conSauBan, conTruoc - 1, 'buổi còn lại sau khi bán')

        // Huỷ bằng bút toán ngược, đúng như `cancelInvoiceAction` làm
        await client.query(
          `UPDATE invoices SET status='cancelled', cancelled_at=now(), cancel_note='kiểm thử'
           WHERE id=$1`,
          [INV],
        )
        await client.query(
          `INSERT INTO package_transactions (tenant_id, customer_package_item_id, type, quantity,
             allocated_value, invoice_item_id, note)
           VALUES ($1,$2,'adjust',1,500000,$3,'Hoàn buổi do huỷ hoá đơn')`,
          [tenantId, pkgItemId.id, itemId],
        )
        await client.query(
          `INSERT INTO cash_transactions (tenant_id, branch_id, cash_account_id, code, direction,
             amount, invoice_id, note)
           VALUES ($1,$2,$3,'HTZZZ-TT-H','out',100000,$4,'Hoàn tiền do huỷ')`,
          [tenantId, branchId, cashId, INV],
        )

        const conSauHuy = Number(
          (
            await client.query(
              `SELECT sessions + bonus_sessions - used_sessions AS n
               FROM customer_package_items WHERE id=$1`,
              [pkgItemId.id],
            )
          ).rows[0].n,
        )
        assertEqual(conSauHuy, conTruoc, 'buổi còn lại sau khi huỷ — phải về như cũ')

        const quySauHuy = Number(
          (await client.query(`SELECT balance FROM cash_accounts WHERE id=$1`, [cashId])).rows[0]
            .balance,
        )
        assertEqual(quySauHuy, quyTruoc, 'số dư quỹ sau khi huỷ — phải về như cũ')

        // Lịch sử phải còn đủ hai vế, không xoá gì
        const soDong = Number(
          (
            await client.query(
              `SELECT count(*)::int AS n FROM package_transactions WHERE invoice_item_id=$1`,
              [itemId],
            )
          ).rows[0].n,
        )
        assertEqual(soDong, 2, 'số dòng sổ cái (phải còn cả "use" lẫn "adjust")')
        const soPhieu = Number(
          (
            await client.query(
              `SELECT count(*)::int AS n FROM cash_transactions WHERE invoice_id=$1`,
              [INV],
            )
          ).rows[0].n,
        )
        assertEqual(soPhieu, 2, 'số phiếu quỹ (phải còn cả thu lẫn chi)')

        await client.query('ROLLBACK TO SAVEPOINT s')
      })

      await mustHold('xoá hoá đơn đã trừ buổi bị CHẶN — buộc phải huỷ đúng cách', async () => {
        await client.query('SAVEPOINT s')
        await client.query(
          `INSERT INTO invoices (id, tenant_id, branch_id, customer_id, code)
           VALUES ($1,$2,$3,$4,'ZZZ-XOA')`,
          [INV, tenantId, branchId, customerId],
        )
        const itemId = (
          await client.query(
            `INSERT INTO invoice_items (invoice_id, tenant_id, product_name, customer_package_item_id)
             VALUES ($1,$2,'Buổi',$3) RETURNING id`,
            [INV, tenantId, pkgItemId.id],
          )
        ).rows[0].id
        await client.query(
          `INSERT INTO package_transactions (tenant_id, customer_package_item_id, type, quantity,
             invoice_item_id) VALUES ($1,$2,'use',-1,$3)`,
          [tenantId, pkgItemId.id, itemId],
        )
        let chan = false
        try {
          await client.query(`DELETE FROM invoices WHERE id=$1`, [INV])
        } catch {
          chan = true
        }
        await client.query('ROLLBACK TO SAVEPOINT s')
        if (!chan) throw new Error('xoá được — khoá ngoại RESTRICT chưa có tác dụng')
      })
    }

    await mustHold('3 quỹ và 4 kênh bán mặc định đã được tạo', async () => {
      const q = (
        await client.query(`SELECT count(*)::int n FROM cash_accounts WHERE tenant_id=$1`, [
          tenantId,
        ])
      ).rows[0].n
      const c = (
        await client.query(`SELECT count(*)::int n FROM sale_channels WHERE tenant_id=$1`, [
          tenantId,
        ])
      ).rows[0].n
      if (q < 3) throw new Error(`chỉ có ${q} quỹ`)
      if (c < 4) throw new Error(`chỉ có ${c} kênh bán`)
    })
  } finally {
    await client.query('ROLLBACK').catch(() => {})
    client.release()
  }

  const { rows: left } = await pool.query(
    `SELECT (SELECT count(*) FROM invoices WHERE code LIKE 'ZZZ%')
          + (SELECT count(*) FROM payments WHERE code LIKE 'ZZZ%')
          + (SELECT count(*) FROM bookings WHERE code LIKE 'ZZZ%') AS n`,
  )
  console.log(`\nDọn dẹp: còn ${left[0].n} bản ghi kiểm thử (phải là 0).`)
  if (Number(left[0].n) !== 0) fail++

  console.log(`\nKết quả: ${pass} đúng, ${fail} sai`)
  await pool.end()
  if (fail > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
