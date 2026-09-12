'use server'

import { revalidatePath } from 'next/cache'
import { and, eq, isNull } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { assertPermission, ForbiddenError } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { branches, employees, roles, userBranchRoles, users } from '@/lib/schema'
import { writeAudit } from '@/lib/audit'

export interface AccountActionState {
  error?: string
  fieldErrors?: Record<string, string>
  ok?: boolean
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function collectErrors(error: { issues: { path: PropertyKey[]; message: string }[] }) {
  const fieldErrors: Record<string, string> = {}
  for (const issue of error.issues) {
    fieldErrors[issue.path.map(String).join('.')] ??= issue.message
  }
  return fieldErrors
}

const createAccountSchema = z.object({
  email: z
    .string('Chưa nhập email')
    .trim()
    .toLowerCase()
    .min(1, 'Chưa nhập email')
    .refine((v) => z.email().safeParse(v).success, 'Email không hợp lệ'),
  password: z.string('Chưa nhập mật khẩu').min(8, 'Mật khẩu phải có ít nhất 8 ký tự'),
  roleId: z
    .string('Chưa chọn vai trò')
    .trim()
    .min(1, 'Chưa chọn vai trò')
    .refine((v) => UUID_RE.test(v), 'Vai trò không hợp lệ'),
  branchId: z
    .string('Chưa chọn chi nhánh')
    .trim()
    .min(1, 'Chưa chọn chi nhánh')
    .refine((v) => UUID_RE.test(v), 'Chi nhánh không hợp lệ'),
})

const changeRoleSchema = z.object({
  roleId: z
    .string('Chưa chọn vai trò')
    .trim()
    .min(1, 'Chưa chọn vai trò')
    .refine((v) => UUID_RE.test(v), 'Vai trò không hợp lệ'),
  branchId: z
    .string('Chưa chọn chi nhánh')
    .trim()
    .min(1, 'Chưa chọn chi nhánh')
    .refine((v) => UUID_RE.test(v), 'Chi nhánh không hợp lệ'),
})

const resetPasswordSchema = z.object({
  password: z.string('Chưa nhập mật khẩu').min(8, 'Mật khẩu phải có ít nhất 8 ký tự'),
})

/**
 * Nhân viên đúng tenant hiện tại, kèm các cột cần cho thao tác tài khoản.
 *
 * Không export — hàm phụ trợ nội bộ, không phải server action.
 */
async function loadEmployeeForAccount(employeeId: string, tenantId: string) {
  const [employee] = await db
    .select({
      id: employees.id,
      code: employees.code,
      fullName: employees.fullName,
      userId: employees.userId,
      tenantId: employees.tenantId,
    })
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1)

  if (!employee || employee.tenantId !== tenantId) return null
  return employee
}

/**
 * Cấp tài khoản đăng nhập cho nhân viên chưa có tài khoản.
 *
 * Tạo `users` (mật khẩu băm bcrypt cost 10), gán `employees.user_id`, và gán
 * đúng một vai trò tại một chi nhánh vào `user_branch_roles` — cả ba việc
 * chung một transaction, vì tài khoản tạo ra mà thiếu vai trò thì đăng nhập
 * được nhưng không làm được gì, coi như hỏng giữa chừng.
 */
export async function createAccountAction(
  employeeId: string,
  _prev: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  let user
  try {
    user = await assertPermission('employee.manage')
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: 'Bạn không có quyền cấp tài khoản.' }
    throw e
  }

  const parsed = createAccountSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return {
      error: 'Vui lòng kiểm tra lại các ô được đánh dấu.',
      fieldErrors: collectErrors(parsed.error),
    }
  }
  const input = parsed.data

  try {
    const employee = await loadEmployeeForAccount(employeeId, user.tenantId)
    if (!employee) return { error: 'Không tìm thấy nhân viên.' }
    if (employee.userId) return { error: 'Nhân viên này đã có tài khoản.' }

    const [role] = await db
      .select({ id: roles.id })
      .from(roles)
      .where(and(eq(roles.id, input.roleId), eq(roles.tenantId, user.tenantId)))
      .limit(1)
    if (!role) {
      return { error: 'Vai trò không hợp lệ.', fieldErrors: { roleId: 'Vai trò không hợp lệ' } }
    }

    const [branch] = await db
      .select({ id: branches.id })
      .from(branches)
      .where(and(eq(branches.id, input.branchId), eq(branches.tenantId, user.tenantId)))
      .limit(1)
    if (!branch) {
      return {
        error: 'Chi nhánh không hợp lệ.',
        fieldErrors: { branchId: 'Chi nhánh không hợp lệ' },
      }
    }

    const [existingEmail] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.tenantId, user.tenantId), eq(users.email, input.email)))
      .limit(1)
    if (existingEmail) {
      return {
        error: 'Email đã được dùng cho tài khoản khác.',
        fieldErrors: { email: 'Email đã tồn tại' },
      }
    }

    const passwordHash = await bcrypt.hash(input.password, 10)

    await db.transaction(async (tx) => {
      const [createdUser] = await tx
        .insert(users)
        .values({
          tenantId: user.tenantId,
          email: input.email,
          fullName: employee.fullName,
          passwordHash,
        })
        .returning({ id: users.id })

      /*
       * Chặn đua tay đôi: nếu một yêu cầu khác đã gán user_id cho nhân viên
       * này giữa lúc đọc và lúc ghi, update dưới đây ảnh hưởng 0 dòng — huỷ
       * toàn bộ giao dịch (kể cả user vừa tạo) thay vì để nhân viên có hai
       * tài khoản.
       */
      const updated = await tx
        .update(employees)
        .set({ userId: createdUser.id })
        .where(and(eq(employees.id, employeeId), isNull(employees.userId)))
        .returning({ id: employees.id })

      if (updated.length === 0) throw new Error('EMPLOYEE_ALREADY_HAS_ACCOUNT')

      await tx.insert(userBranchRoles).values({
        userId: createdUser.id,
        branchId: input.branchId,
        roleId: input.roleId,
      })

      await writeAudit(
        {
          tenantId: user.tenantId,
          userId: user.id,
          entity: 'employee',
          entityId: employeeId,
          action: 'update',
          reason: `Cấp tài khoản đăng nhập cho ${employee.code}`,
        },
        tx,
      )
    })

    revalidatePath(`/admin/employees/${employeeId}/account`)
    revalidatePath(`/admin/employees/${employeeId}/edit`)
    return { ok: true }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    if (message === 'EMPLOYEE_ALREADY_HAS_ACCOUNT') {
      return { error: 'Nhân viên này đã có tài khoản.' }
    }
    if (message.includes('users_tenant_id_email_key')) {
      return {
        error: 'Email đã được dùng cho tài khoản khác.',
        fieldErrors: { email: 'Email đã tồn tại' },
      }
    }
    // Không đưa message gốc (chứa câu lệnh + tham số) ra màn hình — xem
    // app/admin/employees/actions.ts.
    console.error('[createAccountAction]', message)
    return {
      error: 'Không tạo được tài khoản. Vui lòng thử lại — lỗi đã được ghi lại để kiểm tra.',
    }
  }
}

/**
 * Đổi vai trò/chi nhánh của tài khoản đã có.
 *
 * `user_branch_roles` cho phép một người giữ nhiều vai trò ở nhiều chi
 * nhánh, nhưng màn hình quản lý tài khoản chỉ có một ô chọn vai trò và một ô
 * chọn chi nhánh — nên khi lưu, gán cũ bị THAY THẾ hoàn toàn bằng gán mới,
 * không cộng dồn.
 */
export async function changeRoleAction(
  employeeId: string,
  _prev: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  let user
  try {
    user = await assertPermission('employee.manage')
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: 'Bạn không có quyền đổi vai trò.' }
    throw e
  }

  const parsed = changeRoleSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return {
      error: 'Vui lòng kiểm tra lại các ô được đánh dấu.',
      fieldErrors: collectErrors(parsed.error),
    }
  }
  const input = parsed.data

  try {
    const employee = await loadEmployeeForAccount(employeeId, user.tenantId)
    if (!employee) return { error: 'Không tìm thấy nhân viên.' }
    if (!employee.userId) return { error: 'Nhân viên này chưa có tài khoản.' }
    const userId = employee.userId

    const [role] = await db
      .select({ id: roles.id, name: roles.name })
      .from(roles)
      .where(and(eq(roles.id, input.roleId), eq(roles.tenantId, user.tenantId)))
      .limit(1)
    if (!role) {
      return { error: 'Vai trò không hợp lệ.', fieldErrors: { roleId: 'Vai trò không hợp lệ' } }
    }

    const [branch] = await db
      .select({ id: branches.id })
      .from(branches)
      .where(and(eq(branches.id, input.branchId), eq(branches.tenantId, user.tenantId)))
      .limit(1)
    if (!branch) {
      return {
        error: 'Chi nhánh không hợp lệ.',
        fieldErrors: { branchId: 'Chi nhánh không hợp lệ' },
      }
    }

    await db.transaction(async (tx) => {
      await tx.delete(userBranchRoles).where(eq(userBranchRoles.userId, userId))
      await tx
        .insert(userBranchRoles)
        .values({ userId, branchId: input.branchId, roleId: input.roleId })

      await writeAudit(
        {
          tenantId: user.tenantId,
          userId: user.id,
          entity: 'employee',
          entityId: employeeId,
          action: 'update',
          reason: `Đổi vai trò ${employee.code} → ${role.name}`,
        },
        tx,
      )
    })

    revalidatePath(`/admin/employees/${employeeId}/account`)
    return { ok: true }
  } catch (e) {
    console.error('[changeRoleAction]', e instanceof Error ? e.message : e)
    return { error: 'Không đổi được vai trò. Vui lòng thử lại — lỗi đã được ghi lại để kiểm tra.' }
  }
}

/** Đặt lại mật khẩu — không log, không trả lại giá trị mật khẩu ở bất kỳ đâu. */
export async function resetPasswordAction(
  employeeId: string,
  _prev: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  let user
  try {
    user = await assertPermission('employee.manage')
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: 'Bạn không có quyền đặt lại mật khẩu.' }
    throw e
  }

  const parsed = resetPasswordSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return {
      error: 'Vui lòng kiểm tra lại các ô được đánh dấu.',
      fieldErrors: collectErrors(parsed.error),
    }
  }

  try {
    const employee = await loadEmployeeForAccount(employeeId, user.tenantId)
    if (!employee) return { error: 'Không tìm thấy nhân viên.' }
    if (!employee.userId) return { error: 'Nhân viên này chưa có tài khoản.' }
    const userId = employee.userId

    const passwordHash = await bcrypt.hash(parsed.data.password, 10)

    await db.transaction(async (tx) => {
      await tx.update(users).set({ passwordHash }).where(eq(users.id, userId))

      await writeAudit(
        {
          tenantId: user.tenantId,
          userId: user.id,
          entity: 'employee',
          entityId: employeeId,
          action: 'update',
          reason: `Đặt lại mật khẩu cho ${employee.code}`,
        },
        tx,
      )
    })

    return { ok: true }
  } catch (e) {
    console.error('[resetPasswordAction]', e instanceof Error ? e.message : e)
    return {
      error: 'Không đặt lại được mật khẩu. Vui lòng thử lại — lỗi đã được ghi lại để kiểm tra.',
    }
  }
}

/** Khoá / mở khoá tài khoản. */
export async function setAccountActiveAction(
  employeeId: string,
  isActive: boolean,
): Promise<{ ok: boolean; error?: string }> {
  let user
  try {
    user = await assertPermission('employee.manage')
  } catch (e) {
    if (e instanceof ForbiddenError) return { ok: false, error: 'Bạn không có quyền.' }
    throw e
  }

  try {
    const employee = await loadEmployeeForAccount(employeeId, user.tenantId)
    if (!employee) return { ok: false, error: 'Không tìm thấy nhân viên.' }
    if (!employee.userId) return { ok: false, error: 'Nhân viên này chưa có tài khoản.' }
    const userId = employee.userId

    await db.transaction(async (tx) => {
      await tx.update(users).set({ isActive }).where(eq(users.id, userId))

      await writeAudit(
        {
          tenantId: user.tenantId,
          userId: user.id,
          entity: 'employee',
          entityId: employeeId,
          action: 'update',
          reason: isActive
            ? `Mở khoá tài khoản ${employee.code}`
            : `Khoá tài khoản ${employee.code}`,
        },
        tx,
      )
    })

    revalidatePath(`/admin/employees/${employeeId}/account`)
    revalidatePath(`/admin/employees/${employeeId}/edit`)
    return { ok: true }
  } catch (e) {
    console.error('[setAccountActiveAction]', e instanceof Error ? e.message : e)
    return { ok: false, error: 'Không đổi được trạng thái tài khoản.' }
  }
}
