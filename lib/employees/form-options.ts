import { asc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { branches, departments, positions } from '@/lib/schema'

/**
 * Dữ liệu đổ vào các ô chọn của form nhân viên.
 *
 * Cố ý **không** nằm trong file `'use server'`. Mọi hàm export từ một module
 * như thế đều trở thành server action gọi được từ trình duyệt; một hàm nhận
 * `tenantId` làm tham số và không tự kiểm tra quyền sẽ thành cửa đọc dữ liệu
 * của spa khác. Trợ giúp cho render phía máy chủ thì để ở module thường, chỉ
 * những gì thật sự cần trình duyệt gọi mới đặt vào `actions.ts`.
 */
export async function loadEmployeeOptions(tenantId: string) {
  const [departmentRows, positionRows, branchRows] = await Promise.all([
    db
      .select({ value: departments.id, label: departments.name })
      .from(departments)
      .where(eq(departments.tenantId, tenantId))
      .orderBy(asc(departments.name)),

    db
      .select({ value: positions.id, label: positions.name })
      .from(positions)
      .where(eq(positions.tenantId, tenantId))
      .orderBy(asc(positions.name)),

    db
      .select({ value: branches.id, label: branches.name })
      .from(branches)
      .where(eq(branches.tenantId, tenantId))
      .orderBy(asc(branches.name)),
  ])

  return { departments: departmentRows, positions: positionRows, branches: branchRows }
}
