import { requirePermission, can } from '@/lib/auth/session'
import { loadCatalogUnits } from '@/lib/catalog/org-units'
import { CatalogManager } from './catalog-manager'

export const metadata = { title: 'Nhóm hàng, thương hiệu, đơn vị' }
export const dynamic = 'force-dynamic'

export default async function CatalogPage() {
  const user = await requirePermission('product.view')
  const data = await loadCatalogUnits(user.tenantId)

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Nhóm hàng, thương hiệu, đơn vị</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Ba danh mục phụ trợ của hàng hoá. Sửa ở đây thì mọi ô chọn trong phần mềm
          đổi theo.
        </p>
      </div>

      <CatalogManager {...data} canManage={can(user, 'product.manage')} />
    </div>
  )
}
