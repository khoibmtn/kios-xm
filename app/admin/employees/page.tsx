import { desc, eq } from 'drizzle-orm'
import { requirePermission } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { branches, departments, employees, positions } from '@/lib/schema'
import { EmployeeTable, type EmployeeRow } from './employee-table'

export const metadata = { title: 'Nhân viên' }
export const dynamic = 'force-dynamic'

export default async function EmployeesPage() {
  const user = await requirePermission('employee.view')

  const rows: EmployeeRow[] = await db
    .select({
      id: employees.id,
      code: employees.code,
      clockCode: employees.clockCode,
      fullName: employees.fullName,
      phone: employees.phone,
      idNumber: employees.idNumber,
      status: employees.status,
      hiredAt: employees.hiredAt,
      note: employees.note,
      departmentName: departments.name,
      positionName: positions.name,
      branchName: branches.name,
    })
    .from(employees)
    .leftJoin(departments, eq(departments.id, employees.departmentId))
    .leftJoin(positions, eq(positions.id, employees.positionId))
    .leftJoin(branches, eq(branches.id, employees.workBranchId))
    .where(eq(employees.tenantId, user.tenantId))
    .orderBy(desc(employees.createdAt))

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Nhân viên</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Người được ghi nhận nghiệp vụ — thực hiện dịch vụ, tư vấn, thu ngân.
        </p>
      </div>

      <EmployeeTable rows={rows} />
    </div>
  )
}
