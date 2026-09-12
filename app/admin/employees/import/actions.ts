'use server'

import { revalidatePath } from 'next/cache'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { assertPermission, ForbiddenError } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { branches, departments, employees, positions } from '@/lib/schema'
import { writeAudit } from '@/lib/audit'
import type { EmployeeImportRow } from '@/lib/employees/import-map'

export interface EmployeeImportOutcome {
  line: number
  code: string
  name: string
  status: 'created' | 'updated' | 'failed'
  message?: string
}

export interface EmployeeImportResult {
  outcomes: EmployeeImportOutcome[]
  error?: string
}

const MAX_ROWS = 100
const key = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

/**
 * Nhập hồ sơ nhân viên từ bản xuất KiotViet.
 *
 * Trùng mã thì **cập nhật**, không tạo bản sao — và đây là điều quan trọng
 * nhất của hàm này: hồ sơ NV000001 đang giữ liên kết tới tài khoản đăng nhập
 * của chủ spa (`employees.user_id`). Xoá rồi tạo lại sẽ cắt mất liên kết đó và
 * chủ spa đăng nhập vào thấy mình không còn là nhân viên nào cả. Nên câu lệnh
 * dưới đây cố tình **không đụng tới `user_id`**: cấp tài khoản là việc riêng,
 * phải qua đặt mật khẩu (T-22), không suy ra được từ một ô trong tệp.
 *
 * Theo lô vì cùng lý do với các bộ nhập khác — Cloudflare giới hạn 50
 * subrequest mỗi request, nên số truy vấn phải là hằng số.
 */
export async function importEmployeesAction(
  rows: EmployeeImportRow[],
): Promise<EmployeeImportResult> {
  let user
  try {
    user = await assertPermission('employee.manage')
  } catch (e) {
    if (e instanceof ForbiddenError) return { outcomes: [], error: 'Bạn không có quyền.' }
    throw e
  }

  if (rows.length > MAX_ROWS) return { outcomes: [], error: `Mỗi lô tối đa ${MAX_ROWS} dòng.` }
  if (rows.length === 0) return { outcomes: [] }

  try {
    const [branchRows, departmentRows, positionRows, existing] = await Promise.all([
      db
        .select({ id: branches.id, name: branches.name })
        .from(branches)
        .where(eq(branches.tenantId, user.tenantId)),
      db
        .select({ id: departments.id, name: departments.name })
        .from(departments)
        .where(eq(departments.tenantId, user.tenantId)),
      db
        .select({ id: positions.id, name: positions.name })
        .from(positions)
        .where(eq(positions.tenantId, user.tenantId)),
      db
        .select({ code: employees.code })
        .from(employees)
        .where(
          and(
            eq(employees.tenantId, user.tenantId),
            inArray(
              employees.code,
              rows.map((r) => r.code),
            ),
          ),
        ),
    ])

    const branchByName = new Map(branchRows.map((b) => [key(b.name), b.id]))
    const departmentByName = new Map(departmentRows.map((d) => [key(d.name), d.id]))
    const positionByName = new Map(positionRows.map((p) => [key(p.name), p.id]))
    const existingCodes = new Set(existing.map((e) => e.code))

    // Phòng ban và chức danh chưa có thì tạo — một câu cho mỗi loại, không phải
    // một câu cho mỗi dòng.
    const newDepartments = [
      ...new Set(rows.map((r) => r.department).filter((n) => n && !departmentByName.has(key(n)))),
    ]
    if (newDepartments.length > 0) {
      const created = await db
        .insert(departments)
        .values(newDepartments.map((name) => ({ tenantId: user.tenantId, name })))
        .onConflictDoNothing()
        .returning({ id: departments.id, name: departments.name })
      for (const d of created) departmentByName.set(key(d.name), d.id)
    }

    const newPositions = [
      ...new Set(rows.map((r) => r.position).filter((n) => n && !positionByName.has(key(n)))),
    ]
    if (newPositions.length > 0) {
      const created = await db
        .insert(positions)
        .values(newPositions.map((name) => ({ tenantId: user.tenantId, name })))
        .onConflictDoNothing()
        .returning({ id: positions.id, name: positions.name })
      for (const p of created) positionByName.set(key(p.name), p.id)
    }

    const values = rows.map((row) => ({
      tenantId: user.tenantId,
      code: row.code,
      fullName: row.fullName,
      phone: row.phone || null,
      email: row.email || null,
      gender: row.gender,
      birthday: row.birthday || null,
      idNumber: row.idNumber || null,
      address: row.address || null,
      hiredAt: row.hiredAt || null,
      departmentId: row.department ? (departmentByName.get(key(row.department)) ?? null) : null,
      positionId: row.position ? (positionByName.get(key(row.position)) ?? null) : null,
      workBranchId: row.workBranch ? (branchByName.get(key(row.workBranch)) ?? null) : null,
      payBranchId: row.payBranch ? (branchByName.get(key(row.payBranch)) ?? null) : null,
    }))

    await db
      .insert(employees)
      .values(values)
      .onConflictDoUpdate({
        target: [employees.tenantId, employees.code],
        set: {
          fullName: sql`excluded.full_name`,
          phone: sql`excluded.phone`,
          email: sql`excluded.email`,
          gender: sql`excluded.gender`,
          birthday: sql`excluded.birthday`,
          idNumber: sql`excluded.id_number`,
          address: sql`excluded.address`,
          hiredAt: sql`excluded.hired_at`,
          departmentId: sql`excluded.department_id`,
          positionId: sql`excluded.position_id`,
          workBranchId: sql`excluded.work_branch_id`,
          payBranchId: sql`excluded.pay_branch_id`,
          // `user_id` và `status` cố ý không có ở đây — xem chú thích đầu hàm.
        },
      })

    const outcomes: EmployeeImportOutcome[] = rows.map((row) => ({
      line: row.line,
      code: row.code,
      name: row.fullName,
      status: existingCodes.has(row.code) ? 'updated' : 'created',
    }))

    await writeAudit({
      tenantId: user.tenantId,
      userId: user.id,
      entity: 'employee',
      entityId: user.tenantId,
      action: 'create',
      after: { imported: rows.length },
      reason: `Nhập ${rows.length} hồ sơ nhân viên từ tệp`,
    })
    revalidatePath('/admin/employees')

    return { outcomes }
  } catch (e) {
    console.error('[importEmployeesAction]', e instanceof Error ? e.message : String(e))
    return { outcomes: [], error: 'Lô này ghi không thành công. Chi tiết đã được ghi lại.' }
  }
}
