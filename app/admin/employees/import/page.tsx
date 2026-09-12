import Link from 'next/link'
import { requirePermission } from '@/lib/auth/session'
import { EmployeeImportPanel } from './import-panel'

export const metadata = { title: 'Nhập nhân viên từ tệp' }

export default async function ImportEmployeesPage() {
  await requirePermission('employee.manage')

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <Link href="/admin/employees" className="text-muted-foreground text-sm hover:underline">
          ← Nhân viên
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Nhập nhân viên từ tệp</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Tệp được đọc ngay trên máy bạn, xem trước rồi mới ghi.
        </p>
      </div>

      <EmployeeImportPanel />
    </div>
  )
}
