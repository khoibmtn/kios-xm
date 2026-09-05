import Link from 'next/link'
import { requirePermission } from '@/lib/auth/session'
import { loadEmployeeOptions } from '@/lib/employees/form-options'
import { EmployeeForm } from '../employee-form'
import { EMPTY_EMPLOYEE } from '../form-data'

export const metadata = { title: 'Thêm nhân viên' }
export const dynamic = 'force-dynamic'

export default async function NewEmployeePage() {
  const user = await requirePermission('employee.manage')
  const options = await loadEmployeeOptions(user.tenantId)

  // Spa một chi nhánh thì không có gì để chọn — điền sẵn cho đỡ một thao tác.
  const initial = {
    ...EMPTY_EMPLOYEE,
    workBranchId: options.branches.length === 1 ? options.branches[0].value : '',
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <Link href="/admin/employees" className="text-muted-foreground text-sm hover:underline">
          ← Nhân viên
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Thêm nhân viên</h1>
      </div>

      <EmployeeForm initial={initial} {...options} />
    </div>
  )
}
