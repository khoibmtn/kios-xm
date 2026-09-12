import Link from 'next/link'
import { notFound } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { requirePermission } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { employees, users } from '@/lib/schema'
import { loadEmployeeOptions } from '@/lib/employees/form-options'
import { EmployeeForm } from '../../employee-form'
import type { EmployeeFormData } from '../../form-data'

export const metadata = { title: 'Sửa hồ sơ nhân viên' }
export const dynamic = 'force-dynamic'

export default async function EditEmployeePage({
  params,
}: PageProps<'/admin/employees/[id]/edit'>) {
  const user = await requirePermission('employee.manage')
  const { id } = await params

  const [employee] = await db.select().from(employees).where(eq(employees.id, id)).limit(1)

  if (!employee || employee.tenantId !== user.tenantId) notFound()

  const [options, account] = await Promise.all([
    loadEmployeeOptions(user.tenantId),
    employee.userId
      ? db
          .select({ email: users.email, isActive: users.isActive })
          .from(users)
          .where(eq(users.id, employee.userId))
          .limit(1)
      : Promise.resolve([]),
  ])

  const initial: EmployeeFormData = {
    id: employee.id,
    code: employee.code,
    clockCode: employee.clockCode ?? '',
    fullName: employee.fullName,
    phone: employee.phone ?? '',
    email: employee.email ?? '',
    gender: employee.gender ?? '',
    // Cột DATE thuần đã là chuỗi "YYYY-MM-DD" — đúng thứ <input type="date">
    // cần, và giữ nguyên chuỗi thì không có cơ hội lệch ngày vì múi giờ.
    birthday: employee.birthday ?? '',
    idNumber: employee.idNumber ?? '',
    address: employee.address ?? '',
    departmentId: employee.departmentId ?? '',
    positionId: employee.positionId ?? '',
    workBranchId: employee.workBranchId ?? '',
    payBranchId: employee.payBranchId ?? '',
    hiredAt: employee.hiredAt ?? '',
    leftAt: employee.leftAt ?? '',
    status: employee.status,
    bankAccount: employee.bankAccount ?? '',
    bankName: employee.bankName ?? '',
    note: employee.note ?? '',
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <Link href="/admin/employees" className="text-muted-foreground text-sm hover:underline">
          ← Nhân viên
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">{employee.fullName}</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {employee.code}
          {account[0] && (
            <>
              {' · '}
              Tài khoản đăng nhập {account[0].email}
              {!account[0].isActive && ' (đã khoá)'}
            </>
          )}
        </p>
        <Link
          href={`/admin/employees/${id}/account`}
          className="text-primary mt-1 inline-block text-sm hover:underline"
        >
          {account[0] ? 'Quản lý tài khoản đăng nhập →' : 'Cấp tài khoản đăng nhập →'}
        </Link>
      </div>

      <EmployeeForm initial={initial} {...options} />
    </div>
  )
}
