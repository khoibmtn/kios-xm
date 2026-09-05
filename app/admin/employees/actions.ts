'use server'

import { revalidatePath } from 'next/cache'
import { and, desc, eq, like } from 'drizzle-orm'
import { assertPermission, ForbiddenError } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { departments, employees, positions } from '@/lib/schema'
import { writeAudit, diffFields } from '@/lib/audit'
import { employeeSchema, orgUnitSchema } from '@/lib/employees/employee-schema'

export interface ActionState {
  error?: string
  fieldErrors?: Record<string, string>
  savedId?: string
}

/**
 * Mã nhân viên kế tiếp: NV000001, NV000002…
 *
 * Giữ đúng 6 chữ số như dữ liệu sẵn có để danh sách sắp xếp theo mã vẫn đúng
 * thứ tự. Chống trùng thật sự nằm ở ràng buộc UNIQUE (tenant_id, code).
 */
async function nextCode(tenantId: string): Promise<string> {
  const [row] = await db
    .select({ code: employees.code })
    .from(employees)
    .where(and(eq(employees.tenantId, tenantId), like(employees.code, 'NV%')))
    .orderBy(desc(employees.code))
    .limit(1)

  const next = Number.parseInt(row?.code?.slice(2) ?? '0', 10) + 1
  return `NV${String(Number.isFinite(next) ? next : 1).padStart(6, '0')}`
}

function collectErrors(error: { issues: { path: PropertyKey[]; message: string }[] }) {
  const fieldErrors: Record<string, string> = {}
  for (const issue of error.issues) {
    fieldErrors[issue.path.map(String).join('.')] ??= issue.message
  }
  return fieldErrors
}

export async function saveEmployeeAction(
  employeeId: string | null,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let user
  try {
    user = await assertPermission('employee.manage')
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: 'Bạn không có quyền sửa hồ sơ nhân viên.' }
    throw e
  }

  const parsed = employeeSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return {
      error: 'Vui lòng kiểm tra lại các ô được đánh dấu.',
      fieldErrors: collectErrors(parsed.error),
    }
  }
  const input = parsed.data

  const row = {
    tenantId: user.tenantId,
    fullName: input.fullName,
    clockCode: input.clockCode ?? null,
    phone: input.phone ?? null,
    email: input.email ?? null,
    gender: input.gender ?? null,
    birthday: input.birthday ?? null,
    idNumber: input.idNumber ?? null,
    address: input.address ?? null,
    departmentId: input.departmentId ?? null,
    positionId: input.positionId ?? null,
    workBranchId: input.workBranchId ?? null,
    payBranchId: input.payBranchId ?? null,
    hiredAt: input.hiredAt ?? null,
    leftAt: input.leftAt ?? null,
    status: input.status,
    bankAccount: input.bankAccount ?? null,
    bankName: input.bankName ?? null,
    note: input.note ?? null,
  }

  try {
    const savedId = await db.transaction(async (tx) => {
      let id = employeeId

      if (id) {
        const [existing] = await tx
          .select()
          .from(employees)
          .where(and(eq(employees.id, id), eq(employees.tenantId, user.tenantId)))
          .limit(1)
        if (!existing) throw new Error('Không tìm thấy nhân viên')

        await tx
          .update(employees)
          .set({ ...row, code: input.code ?? existing.code })
          .where(eq(employees.id, id))

        await writeAudit(
          {
            tenantId: user.tenantId,
            userId: user.id,
            entity: 'employee',
            entityId: id,
            action: 'update',
            ...diffFields(existing as unknown as Record<string, unknown>, {
              fullName: input.fullName,
              status: input.status,
              departmentId: row.departmentId,
              positionId: row.positionId,
            }),
            // Nghỉ việc là mốc ảnh hưởng lương và hoa hồng, cần đọc được ngay
            // trong nhật ký mà không phải mở hồ sơ.
            reason:
              existing.status !== input.status
                ? input.status === 'left'
                  ? `Ngừng làm việc từ ${input.leftAt}`
                  : 'Đi làm lại'
                : undefined,
          },
          tx,
        )
      } else {
        const [created] = await tx
          .insert(employees)
          .values({ ...row, code: input.code ?? (await nextCode(user.tenantId)) })
          .returning({ id: employees.id })
        id = created.id

        await writeAudit(
          {
            tenantId: user.tenantId,
            userId: user.id,
            entity: 'employee',
            entityId: id,
            action: 'create',
            after: { fullName: input.fullName, status: input.status },
          },
          tx,
        )
      }

      return id
    })

    revalidatePath('/admin/employees')
    revalidatePath(`/admin/employees/${savedId}`)
    return { savedId }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    if (message.includes('employees_tenant_id_code_key')) {
      return { error: 'Mã nhân viên này đã tồn tại.', fieldErrors: { code: 'Mã đã được dùng' } }
    }
    /*
     * Không đưa lỗi gốc ra màn hình. Drizzle nhét nguyên câu lệnh và toàn bộ
     * tham số vào `message`, nên một lỗi lược đồ tầm thường sẽ in cả tên cột,
     * id chi nhánh lẫn dữ liệu cá nhân của nhân viên lên giao diện — và người
     * dùng cũng chẳng làm gì được với chuỗi đó. Chi tiết đi vào nhật ký Worker
     * (`wrangler tail`), người dùng nhận một câu đọc được.
     */
    console.error('[saveEmployeeAction]', message)
    return { error: 'Không lưu được. Vui lòng thử lại — lỗi đã được ghi lại để kiểm tra.' }
  }
}

/**
 * Tạo nhanh phòng ban / chức danh ngay trong form nhân viên.
 *
 * Bắt chước KiotViet: ô chọn có sẵn "Tạo mới" thay vì bắt người dùng bỏ dở hồ
 * sơ đang nhập để đi sang màn hình khác. Trả về id để form chọn luôn mục vừa
 * tạo; nếu tên đã tồn tại thì trả về id cũ, coi như chọn lại — người dùng chỉ
 * muốn có mục đó trong danh sách, không quan tâm nó mới hay cũ.
 */
export async function createOrgUnitAction(
  kind: 'department' | 'position',
  name: string,
): Promise<{ id?: string; name?: string; error?: string }> {
  let user
  try {
    user = await assertPermission('employee.manage')
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: 'Bạn không có quyền.' }
    throw e
  }

  const parsed = orgUnitSchema.safeParse({ kind, name })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const table = kind === 'department' ? departments : positions
  const cleanName = parsed.data.name

  const [existing] = await db
    .select({ id: table.id, name: table.name })
    .from(table)
    .where(and(eq(table.tenantId, user.tenantId), eq(table.name, cleanName)))
    .limit(1)
  if (existing) return existing

  const [created] = await db
    .insert(table)
    .values({ tenantId: user.tenantId, name: cleanName })
    .returning({ id: table.id, name: table.name })

  revalidatePath('/admin/employees')
  return created
}
