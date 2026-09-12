import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local', override: true })

import { Pool } from 'pg'

/**
 * Kiểm chứng ràng buộc lịch hẹn — `bookings`, `booking_items`,
 * `booking_cancel_reasons` (`drizzle/0011_bookings.sql`) — thực sự được cơ sở
 * dữ liệu cưỡng chế.
 *
 * Hai nhóm, và phải có đủ cả hai. `mustReject` cố tình ghi sai và mong đợi bị
 * chặn. `mustHold` dựng dữ liệu **đúng** rồi đối chiếu kết quả. Bài học ngày
 * 07/09: mười ba phép thử nhóm một đều xanh trong khi tính năng gói hỏng hoàn
 * toàn, vì không có phép thử nào chèn một dòng hợp lệ.
 *
 * Ở đây nhóm hai còn quan trọng hơn: thứ dễ hỏng nhất của ràng buộc chống
 * trùng không phải là "cho lọt cái sai" mà là **"chặn nhầm cái đúng"** — hai ca
 * liền kề 9:00–10:00 và 10:00–11:00 mà bị từ chối thì lễ tân sẽ phải lùi một
 * phút cho vừa lòng máy, mỗi ngày, mãi mãi.
 *
 * An toàn: đây là cơ sở dữ liệu SẢN XUẤT chứa dữ liệu kinh doanh thật. Mọi
 * thao tác ghi nằm trong BEGIN…ROLLBACK — không COMMIT bất cứ gì, không sửa
 * hàng có sẵn. Giờ dùng trong bài kiểm đặt ở năm 2030 để chắc chắn không đụng
 * lịch thật.
 */
const pool = new Pool({ connectionString: process.env.DIRECT_URL })

let pass = 0
let fail = 0

/**
 * Chạy một chuỗi câu lệnh trong cùng một transaction; **câu cuối cùng** phải bị
 * từ chối, các câu trước phải chạy được (chúng là phần dựng dữ liệu nền).
 *
 * Mã SQLSTATE được in kèm và kiểm tra: một bài kiểm "đạt" vì chính câu SQL của
 * nó sai cú pháp (42601) thì tệ hơn là không có bài kiểm nào, vì nó cho cảm
 * giác an toàn giả. Chuyện này đã xảy ra thật ở lần chạy đầu.
 */
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
            `  ✗ ${label} — câu dựng dữ liệu nền #${i + 1} hỏng (${code}): ${(e as Error).message}`,
          )
          fail++
          return
        }
        if (!CONSTRAINT_CODES.has(code)) {
          console.log(
            `  ✗ ${label} — bị chặn nhưng KHÔNG phải do ràng buộc (${code}): ${(e as Error).message}`,
          )
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
  if (actual !== expected) {
    throw new Error(`${label}: mong đợi ${String(expected)}, thực tế ${String(actual)}`)
  }
}

/** 2030-03-15, giờ UTC — xa mọi lịch thật. */
const T = (hhmm: string) => `2030-03-15T${hhmm}:00+07:00`

async function main() {
  const one = async (sql: string): Promise<string | null> =>
    (await pool.query(sql)).rows[0]?.id ?? null

  const tenantId = await one('SELECT id FROM tenants LIMIT 1')
  const branchId = await one('SELECT id FROM branches LIMIT 1')
  const userId = await one('SELECT id FROM users LIMIT 1')
  const customerId = await one('SELECT id FROM customers LIMIT 1')
  const serviceId = await one(`SELECT id FROM products WHERE kind = 'service' LIMIT 1`)
  const employeeId = await one('SELECT id FROM employees LIMIT 1')

  if (!tenantId || !branchId || !customerId) {
    console.log('Thiếu tenant, chi nhánh hoặc khách hàng — bỏ qua toàn bộ kiểm thử.')
    await pool.end()
    return
  }
  if (!employeeId) console.log('Cảnh báo: chưa có nhân viên — bỏ qua nhóm trùng nhân viên.')

  /*
   * Spa chưa khai phòng nào, nên bài kiểm tự dựng hai phòng tạm ngay trong
   * transaction rồi rollback. Phụ thuộc vào dữ liệu có sẵn sẽ khiến nhóm kiểm
   * thử quan trọng nhất lặng lẽ bị bỏ qua — mà một nhóm bị bỏ qua trông y hệt
   * một nhóm đã đạt khi người ta chỉ liếc dòng tổng kết.
   */
  const mkRooms: [string, unknown[]] = [
    `INSERT INTO rooms (id, tenant_id, branch_id, name) VALUES
       ('11111111-1111-4111-8111-111111111111', $1, $2, 'ZZZ phòng A'),
       ('22222222-2222-4222-8222-222222222222', $1, $2, 'ZZZ phòng B')`,
    [tenantId, branchId],
  ]
  const RA = '11111111-1111-4111-8111-111111111111'
  const RB = '22222222-2222-4222-8222-222222222222'
  const BID = '33333333-3333-4333-8333-333333333333'

  const mkBooking = (code = 'ZZZ-KT'): [string, unknown[]] => [
    `INSERT INTO bookings (id, tenant_id, branch_id, customer_id, code, created_by_user_id)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [BID, tenantId, branchId, customerId, code, userId],
  ]

  const item = (
    room: string | null,
    emp: string | null,
    from: string,
    to: string,
    cancelled = false,
  ): [string, unknown[]] => [
    `INSERT INTO booking_items
       (booking_id, tenant_id, service_id, service_name, room_id, performer_employee_id,
        starts_at, ends_at, cancelled_at, cancel_note)
     VALUES ($1,$2,$3,'Dịch vụ kiểm thử',$4,$5,$6,$7,$8,$9)`,
    [
      BID,
      tenantId,
      serviceId,
      room,
      emp,
      T(from),
      T(to),
      cancelled ? new Date() : null,
      cancelled ? 'kiểm thử' : null,
    ],
  ]

  console.log('\nChống trùng phòng:')
  await mustReject('cùng phòng, chồng hoàn toàn (9:00–10:00 × 2)', [
    mkRooms,
    mkBooking(),
    item(RA, null, '09:00', '10:00'),
    item(RA, null, '09:00', '10:00'),
  ])
  await mustReject('cùng phòng, chồng một phần (9:00–10:00 và 9:30–10:30)', [
    mkRooms,
    mkBooking(),
    item(RA, null, '09:00', '10:00'),
    item(RA, null, '09:30', '10:30'),
  ])
  await mustReject('cùng phòng, khoảng này nằm trọn trong khoảng kia (9:00–11:00 ⊃ 9:30–10:00)', [
    mkRooms,
    mkBooking(),
    item(RA, null, '09:00', '11:00'),
    item(RA, null, '09:30', '10:00'),
  ])

  if (employeeId) {
    console.log('\nChống trùng nhân viên:')
    await mustReject('cùng kỹ thuật viên, chồng giờ', [
      mkBooking(),
      item(null, employeeId, '14:00', '15:00'),
      item(null, employeeId, '14:30', '15:30'),
    ])
    await mustReject('cùng kỹ thuật viên, chồng giờ dù khác phòng', [
      mkRooms,
      mkBooking(),
      item(RA, employeeId, '14:00', '15:00'),
      item(RB, employeeId, '14:30', '15:30'),
    ])
  }

  console.log('\nThời gian vô lý:')
  await mustReject('giờ kết thúc bằng giờ bắt đầu', [
    mkBooking(),
    item(null, null, '09:00', '09:00'),
  ])
  await mustReject('giờ kết thúc trước giờ bắt đầu', [
    mkBooking(),
    item(null, null, '10:00', '09:00'),
  ])
  await mustReject('buổi dài hơn 12 tiếng', [mkBooking(), item(null, null, '06:00', '19:30')])

  console.log('\nPhiếu hẹn:')
  await mustReject('không có khách lẫn tên khách vãng lai', [
    [
      `INSERT INTO bookings (tenant_id, branch_id, code) VALUES ($1,$2,'ZZZ1')`,
      [tenantId, branchId],
    ],
  ])
  await mustReject('tên khách vãng lai chỉ toàn khoảng trắng', [
    [
      `INSERT INTO bookings (tenant_id, branch_id, code, guest_name) VALUES ($1,$2,'ZZZ2','   ')`,
      [tenantId, branchId],
    ],
  ])
  await mustReject("status='cancelled' mà không có cancelled_at", [
    [
      `INSERT INTO bookings (tenant_id, branch_id, customer_id, code, status, cancel_note)
      VALUES ($1,$2,$3,'ZZZ3','cancelled','khách bận')`,
      [tenantId, branchId, customerId],
    ],
  ])
  await mustReject("status='cancelled' có cancelled_at nhưng không nêu lý do", [
    [
      `INSERT INTO bookings (tenant_id, branch_id, customer_id, code, status, cancelled_at)
      VALUES ($1,$2,$3,'ZZZ4','cancelled',now())`,
      [tenantId, branchId, customerId],
    ],
  ])
  await mustReject('hai phiếu hẹn cùng tenant và cùng mã', [
    [
      `INSERT INTO bookings (tenant_id, branch_id, customer_id, code)
      VALUES ($1,$2,$3,'ZZZ5'),($1,$2,$3,'ZZZ5')`,
      [tenantId, branchId, customerId],
    ],
  ])
  await mustReject('hai lý do huỷ cùng tenant và cùng tên', [
    [
      `INSERT INTO booking_cancel_reasons (tenant_id, name) VALUES ($1,'ZZZ trùng'),($1,'ZZZ trùng')`,
      [tenantId],
    ],
  ])

  // ───────────────── Nhóm hai: cái đúng phải đi lọt ─────────────────

  console.log('\nCái đúng phải đi lọt (dựng thật rồi rollback):')
  const client = await pool.connect()
  const run = async (
    label: string,
    statements: [string, unknown[]][],
    after?: () => Promise<void>,
  ) =>
    mustHold(label, async () => {
      await client.query('SAVEPOINT s')
      try {
        for (const [sql, params] of statements) await client.query(sql, params)
        if (after) await after()
      } finally {
        await client.query('ROLLBACK TO SAVEPOINT s')
      }
    })

  try {
    await client.query('BEGIN')

    await run('hai ca LIỀN KỀ cùng phòng (9:00–10:00 rồi 10:00–11:00) đi lọt', [
      mkRooms,
      mkBooking(),
      item(RA, null, '09:00', '10:00'),
      item(RA, null, '10:00', '11:00'),
    ])
    await run('cùng giờ nhưng KHÁC phòng → đi lọt', [
      mkRooms,
      mkBooking(),
      item(RA, null, '09:00', '10:00'),
      item(RB, null, '09:00', '10:00'),
    ])
    await run('cùng phòng cùng giờ nhưng dòng cũ đã huỷ → đi lọt (huỷ thì nhả chỗ)', [
      mkRooms,
      mkBooking(),
      item(RA, null, '09:00', '10:00', true),
      item(RA, null, '09:00', '10:00'),
    ])
    await run('không khai phòng thì hai dòng chồng giờ vẫn lọt', [
      mkBooking(),
      item(null, null, '09:00', '10:00'),
      item(null, null, '09:00', '10:00'),
    ])
    if (employeeId) {
      await run('hai ca liền kề cùng kỹ thuật viên đi lọt', [
        mkBooking(),
        item(null, employeeId, '09:00', '10:00'),
        item(null, employeeId, '10:00', '11:00'),
      ])
    }

    await run(
      'huỷ phiếu → trigger huỷ luôn cả 2 dòng, và chỗ được nhả ra ngay',
      [mkRooms, mkBooking(), item(RA, null, '15:00', '16:00'), item(RA, null, '16:00', '17:00')],
      async () => {
        await client.query(
          `UPDATE bookings SET status='cancelled', cancelled_at=now(), cancel_note='kiểm thử' WHERE id=$1`,
          [BID],
        )
        const { rows } = await client.query(
          `SELECT count(*)::int AS n FROM booking_items WHERE booking_id=$1 AND cancelled_at IS NULL`,
          [BID],
        )
        assertEqual(rows[0].n, 0, 'số dòng chưa huỷ sau khi huỷ phiếu')
        // Chỗ đã nhả: đặt lại đúng khung giờ đó phải được.
        await client.query(...item(RA, null, '15:00', '16:00'))
      },
    )

    await mustHold('5 lý do huỷ mặc định đã được chèn sẵn', async () => {
      const { rows } = await client.query(
        'SELECT count(*)::int AS n FROM booking_cancel_reasons WHERE tenant_id=$1',
        [tenantId],
      )
      if (rows[0].n < 5) throw new Error(`chỉ có ${rows[0].n} lý do`)
    })
  } finally {
    await client.query('ROLLBACK').catch(() => {})
    client.release()
  }

  const { rows: left } = await pool.query(
    `SELECT (SELECT count(*) FROM bookings WHERE code LIKE 'ZZZ%')
          + (SELECT count(*) FROM rooms WHERE name LIKE 'ZZZ%') AS n`,
  )
  console.log(`\nDọn dẹp: còn ${left[0].n} bản ghi kiểm thử trong CSDL (phải là 0).`)
  if (Number(left[0].n) !== 0) fail++

  console.log(`\nKết quả: ${pass} đúng, ${fail} sai`)
  await pool.end()
  if (fail > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
