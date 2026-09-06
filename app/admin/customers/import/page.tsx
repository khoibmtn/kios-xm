import Link from 'next/link'
import { requirePermission } from '@/lib/auth/session'
import { CustomerImportPanel } from './import-panel'

export const metadata = { title: 'Nhập khách hàng từ tệp' }

export default async function ImportCustomersPage() {
  await requirePermission('customer.manage')

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <Link href="/admin/customers" className="text-muted-foreground text-sm hover:underline">
          ← Khách hàng
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Nhập khách hàng từ tệp</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Tệp được đọc ngay trên máy bạn, xem trước rồi mới ghi.
        </p>
      </div>

      <CustomerImportPanel />
    </div>
  )
}
