import Link from 'next/link'
import { requirePermission } from '@/lib/auth/session'
import { loadFormOptions } from '@/lib/catalog/form-options'
import { ProductForm } from '../product-form'
import { EMPTY_FORM } from '../form-data'
import type { ProductKind } from '@/lib/catalog/labels'

export const metadata = { title: 'Thêm hàng hoá' }
export const dynamic = 'force-dynamic'

const KINDS: ProductKind[] = ['product', 'service', 'package', 'card']

export default async function NewProductPage({ searchParams }: PageProps<'/admin/products/new'>) {
  const user = await requirePermission('product.manage')
  const options = await loadFormOptions(user.tenantId)

  // Cho phép mở thẳng đúng loại: /admin/products/new?kind=package
  const params = await searchParams
  const requested = typeof params.kind === 'string' ? params.kind : ''
  const kind = KINDS.includes(requested as ProductKind) ? (requested as ProductKind) : 'service'

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <Link href="/admin/products" className="text-muted-foreground text-sm hover:underline">
          ← Hàng hoá
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Thêm hàng hoá</h1>
      </div>

      <ProductForm initial={{ ...EMPTY_FORM, kind }} {...options} />
    </div>
  )
}
