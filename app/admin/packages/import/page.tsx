import Link from 'next/link'
import { requirePermission } from '@/lib/auth/session'
import { PackageImportPanel } from './import-panel'

export const metadata = { title: 'Nhập gói đã bán từ tệp' }

export default async function ImportPackagesPage() {
  await requirePermission('package.sell')

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <Link href="/admin/packages" className="text-muted-foreground text-sm hover:underline">
          ← Gói, thẻ đã bán
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Nhập gói đã bán từ tệp</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Tệp được đọc ngay trên máy bạn, xem trước rồi mới ghi.
        </p>
      </div>

      <PackageImportPanel />
    </div>
  )
}
