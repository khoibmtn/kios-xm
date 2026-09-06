import { ShoppingCart } from 'lucide-react'
import { requirePermission } from '@/lib/auth/session'

export const metadata = { title: 'Bán hàng' }

export default async function PosSalePage() {
  await requirePermission('invoice.create')

  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="max-w-md text-center">
        <ShoppingCart className="text-muted-foreground mx-auto size-10" />
        <h1 className="mt-4 text-lg font-semibold">Màn hình bán hàng đang được dựng</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Sẽ có nhiều hoá đơn mở song song, chọn hàng theo bốn loại, gán kỹ thuật viên
          và người tư vấn cho từng dòng, trừ buổi từ gói và trừ tiền từ thẻ.
        </p>
        <p className="text-muted-foreground mt-4 text-xs">
          Danh mục hàng hoá đã sẵn sàng ở <strong>Quản trị → Hàng hoá</strong>.
        </p>
      </div>
    </div>
  )
}
