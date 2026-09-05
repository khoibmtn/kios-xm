import Link from 'next/link'
import { asc, eq, sql } from 'drizzle-orm'
import { requirePermission, can } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { brands, categories, inventory, products, units } from '@/lib/schema'
import { ProductTable, type ProductRow } from './product-table'

export const metadata = { title: 'Hàng hoá' }
export const dynamic = 'force-dynamic'

export default async function ProductsPage() {
  const user = await requirePermission('product.view')

  // Lễ tân và kỹ thuật viên không được thấy giá vốn (ADR-001 §3.5),
  // nên cột này bị cắt ngay từ truy vấn chứ không chỉ ẩn ở giao diện.
  const showCost = can(user, 'financial.view_cost')

  const rows = await db
    .select({
      id: products.id,
      code: products.code,
      name: products.name,
      kind: products.kind,
      basePrice: products.basePrice,
      cost: showCost ? products.cost : sql<string>`NULL`,
      durationMinutes: products.durationMinutes,
      cardFaceValue: products.cardFaceValue,
      cardBonusValue: products.cardBonusValue,
      validityType: products.validityType,
      validityValue: products.validityValue,
      trackInventory: products.trackInventory,
      minQuantity: products.minQuantity,
      isActive: products.isActive,
      allowsSale: products.allowsSale,
      categoryName: categories.name,
      brandName: brands.name,
      unitName: units.name,
      onHand: sql<string | null>`(
        SELECT sum(${inventory.onHand}) FROM ${inventory}
        WHERE ${inventory.productId} = ${products.id}
      )`,
    })
    .from(products)
    .leftJoin(categories, eq(categories.id, products.categoryId))
    .leftJoin(brands, eq(brands.id, products.brandId))
    .leftJoin(units, eq(units.id, products.unitId))
    .where(eq(products.tenantId, user.tenantId))
    .orderBy(asc(products.code))

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Hàng hoá</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Bốn loại dùng chung một danh mục: sản phẩm bán lẻ, dịch vụ theo buổi,
          gói liệu trình và thẻ tài khoản trả trước.
        </p>
      </div>

      <ProductTable
        rows={rows as ProductRow[]}
        showCost={showCost}
        canManage={can(user, 'product.manage')}
      />
    </div>
  )
}
