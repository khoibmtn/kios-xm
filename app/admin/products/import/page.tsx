import Link from 'next/link'
import { requirePermission } from '@/lib/auth/session'
import { ImportPanel } from './import-panel'

export const metadata = { title: 'Nhập hàng hoá từ tệp' }

export default async function ImportProductsPage() {
  await requirePermission('product.manage')

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <Link href="/admin/products" className="text-muted-foreground text-sm hover:underline">
          ← Hàng hoá
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Nhập hàng hoá từ tệp</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Dùng khi chuyển danh mục từ phần mềm cũ sang. Tệp được đọc ngay trên máy bạn,
          xem trước rồi mới ghi.
        </p>
      </div>

      <ImportPanel />
    </div>
  )
}
