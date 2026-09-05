import Link from 'next/link'
import { notFound } from 'next/navigation'
import { asc, eq } from 'drizzle-orm'
import { requirePermission } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { packageItems, products, serviceMaterials } from '@/lib/schema'
import { loadFormOptions } from '@/lib/catalog/form-options'
import { ProductForm } from '../../product-form'
import type { ProductFormData } from '../../form-data'
import type { ProductKind } from '@/lib/catalog/labels'

export const metadata = { title: 'Sửa hàng hoá' }
export const dynamic = 'force-dynamic'

/** numeric của Postgres trả về chuỗi "500000.00" — form chỉ cần phần nguyên. */
function toAmount(v: string | null): string {
  if (v == null) return ''
  const n = Number(v)
  return Number.isFinite(n) ? String(Math.round(n)) : ''
}

export default async function EditProductPage({
  params,
}: PageProps<'/admin/products/[id]/edit'>) {
  const user = await requirePermission('product.manage')
  const { id } = await params

  const [product] = await db
    .select()
    .from(products)
    .where(eq(products.id, id))
    .limit(1)

  if (!product || product.tenantId !== user.tenantId) notFound()

  const [options, components, materials] = await Promise.all([
    loadFormOptions(user.tenantId),
    db
      .select()
      .from(packageItems)
      .where(eq(packageItems.packageId, id))
      .orderBy(asc(packageItems.sortOrder)),
    db.select().from(serviceMaterials).where(eq(serviceMaterials.serviceId, id)),
  ])

  const initial: ProductFormData = {
    id: product.id,
    kind: product.kind as ProductKind,
    code: product.code,
    name: product.name,
    categoryId: product.categoryId ?? '',
    brandId: product.brandId ?? '',
    unitId: product.unitId ?? '',
    basePrice: toAmount(product.basePrice),
    cost: toAmount(product.cost),
    description: product.description ?? '',
    isActive: product.isActive,
    allowsSale: product.allowsSale,
    durationMinutes: product.durationMinutes ? String(product.durationMinutes) : '60',
    cardFaceValue: toAmount(product.cardFaceValue),
    cardBonusValue: toAmount(product.cardBonusValue),
    validityType: product.validityType ?? 'unlimited',
    validityValue: product.validityValue ? String(product.validityValue) : '',
    trackInventory: product.trackInventory,
    minQuantity: product.minQuantity ? String(Number(product.minQuantity)) : '',
    maxQuantity: product.maxQuantity ? String(Number(product.maxQuantity)) : '',
    components: components.map((c) => ({
      serviceId: c.serviceId,
      sessions: String(c.sessions),
      bonusSessions: String(c.bonusSessions),
      retailPrice: toAmount(c.retailPrice),
    })),
    materials: materials.map((m) => ({
      materialId: m.materialId,
      quantity: String(Number(m.quantity)),
    })),
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <Link
          href={`/admin/products/${id}`}
          className="text-muted-foreground text-sm hover:underline"
        >
          ← {product.name}
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Sửa hàng hoá</h1>
        <p className="text-muted-foreground mt-1 text-sm">{product.code}</p>
      </div>

      <ProductForm initial={initial} {...options} />
    </div>
  )
}
