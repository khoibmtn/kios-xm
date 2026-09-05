import Link from 'next/link'
import { notFound } from 'next/navigation'
import { asc, eq } from 'drizzle-orm'
import { requirePermission, can } from '@/lib/auth/session'
import { db } from '@/lib/db'
import {
  brands,
  categories,
  inventory,
  packageItems,
  products,
  serviceMaterials,
  units,
} from '@/lib/schema'
import { formatDuration, formatMoney, formatPercent, formatQuantity } from '@/lib/format'
import { KIND_LABEL, KIND_TONE, formatValidity, type ProductKind } from '@/lib/catalog/labels'
import { Badge } from '@/components/data-table/filters'
import { allocatePackageValue } from '@/lib/catalog/package-allocation'
import { alias } from 'drizzle-orm/pg-core'

export const dynamic = 'force-dynamic'

export default async function ProductDetailPage({ params }: PageProps<'/admin/products/[id]'>) {
  const user = await requirePermission('product.view')
  const { id } = await params
  const showCost = can(user, 'financial.view_cost')

  const [product] = await db
    .select({
      id: products.id,
      code: products.code,
      name: products.name,
      kind: products.kind,
      basePrice: products.basePrice,
      cost: products.cost,
      description: products.description,
      durationMinutes: products.durationMinutes,
      cardFaceValue: products.cardFaceValue,
      cardBonusValue: products.cardBonusValue,
      validityType: products.validityType,
      validityValue: products.validityValue,
      trackInventory: products.trackInventory,
      minQuantity: products.minQuantity,
      isActive: products.isActive,
      categoryName: categories.name,
      brandName: brands.name,
      unitName: units.name,
    })
    .from(products)
    .leftJoin(categories, eq(categories.id, products.categoryId))
    .leftJoin(brands, eq(brands.id, products.brandId))
    .leftJoin(units, eq(units.id, products.unitId))
    .where(eq(products.id, id))
    .limit(1)

  if (!product || !('id' in product)) notFound()

  const kind = product.kind as ProductKind

  // Thành phần gói + phân bổ giá trị
  const service = alias(products, 'service')
  const parts =
    kind === 'package'
      ? await db
          .select({
            serviceId: packageItems.serviceId,
            serviceName: service.name,
            sessions: packageItems.sessions,
            bonusSessions: packageItems.bonusSessions,
            retailPrice: packageItems.retailPrice,
            durationMinutes: service.durationMinutes,
          })
          .from(packageItems)
          .innerJoin(service, eq(service.id, packageItems.serviceId))
          .where(eq(packageItems.packageId, id))
          .orderBy(asc(packageItems.sortOrder))
      : []

  const allocation =
    parts.length > 0
      ? allocatePackageValue(
          Number(product.basePrice),
          parts.map((p) => ({
            serviceId: p.serviceId,
            serviceName: p.serviceName,
            sessions: p.sessions,
            bonusSessions: p.bonusSessions,
            retailPrice: Number(p.retailPrice),
          })),
        )
      : null

  // Định mức nguyên vật liệu
  const material = alias(products, 'material')
  const materials =
    kind === 'service'
      ? await db
          .select({
            materialId: serviceMaterials.materialId,
            materialName: material.name,
            quantity: serviceMaterials.quantity,
            unitName: units.name,
            cost: material.cost,
          })
          .from(serviceMaterials)
          .innerJoin(material, eq(material.id, serviceMaterials.materialId))
          .leftJoin(units, eq(units.id, material.unitId))
          .where(eq(serviceMaterials.serviceId, id))
      : []

  const stock = product.trackInventory
    ? await db.select().from(inventory).where(eq(inventory.productId, id))
    : []

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link href="/admin/products" className="text-muted-foreground text-sm hover:underline">
          ← Hàng hoá
        </Link>
        <div className="mt-2 flex flex-wrap items-start gap-3">
          <h1 className="text-2xl font-bold tracking-tight">{product.name}</h1>
          <Badge tone={KIND_TONE[kind]}>{KIND_LABEL[kind]}</Badge>
          {!product.isActive && <Badge>Ngừng bán</Badge>}
        </div>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <p className="text-muted-foreground text-sm">
            {product.code}
            {product.categoryName && <> · {product.categoryName}</>}
            {product.brandName && <> · {product.brandName}</>}
          </p>
          {can(user, 'product.manage') && (
            <Link
              href={`/admin/products/${id}/edit`}
              className="border-border hover:bg-muted rounded-md border px-4 py-2 text-sm font-medium"
            >
              Sửa
            </Link>
          )}
        </div>
      </div>

      <section className="border-border bg-card rounded-lg border p-5">
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">Giá bán</dt>
            <dd className="tabular mt-0.5 text-lg font-semibold">
              {formatMoney(product.basePrice)} đ
            </dd>
          </div>
          {showCost && (
            <div>
              <dt className="text-muted-foreground">Giá vốn</dt>
              <dd className="tabular mt-0.5 text-lg">{formatMoney(product.cost)} đ</dd>
            </div>
          )}
          {kind === 'service' && (
            <div>
              <dt className="text-muted-foreground">Thời lượng</dt>
              <dd className="mt-0.5 text-lg">{formatDuration(product.durationMinutes)}</dd>
            </div>
          )}
          {kind === 'card' && (
            <>
              <div>
                <dt className="text-muted-foreground">Mệnh giá</dt>
                <dd className="tabular mt-0.5 text-lg">{formatMoney(product.cardFaceValue)} đ</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Tặng thêm</dt>
                <dd className="tabular text-success mt-0.5 text-lg">
                  {formatMoney(product.cardBonusValue)} đ
                </dd>
              </div>
            </>
          )}
          {(kind === 'package' || kind === 'card') && (
            <div>
              <dt className="text-muted-foreground">Hạn dùng</dt>
              <dd className="mt-0.5 text-lg">
                {formatValidity(product.validityType, product.validityValue)}
              </dd>
            </div>
          )}
          {product.unitName && (
            <div>
              <dt className="text-muted-foreground">Đơn vị</dt>
              <dd className="mt-0.5 text-lg">{product.unitName}</dd>
            </div>
          )}
        </dl>
      </section>

      {/* Gói: bảng phân bổ giá trị — phần quan trọng nhất của màn hình này */}
      {allocation && (
        <section className="border-border bg-card rounded-lg border p-5">
          <h2 className="font-semibold">Thành phần gói và giá trị mỗi buổi</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Giá gói được phân bổ theo tỷ trọng giá bán lẻ. Khi khách dùng một buổi,
            hoá đơn ghi 0 đồng nhưng buổi đó vẫn mang giá trị dưới đây — dùng để tính
            hoa hồng và báo cáo hiệu suất.
          </p>

          {allocation.warnings.map((w) => (
            <p key={w} className="text-warning bg-warning/10 mt-3 rounded-md px-3 py-2 text-sm">
              {w}
            </p>
          ))}

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/60">
                <tr className="text-muted-foreground text-left">
                  <th className="px-3 py-2 font-medium">Dịch vụ</th>
                  <th className="px-3 py-2 text-right font-medium">Số buổi</th>
                  <th className="px-3 py-2 text-right font-medium">Giá lẻ</th>
                  <th className="px-3 py-2 text-right font-medium">Tỷ trọng</th>
                  <th className="px-3 py-2 text-right font-medium">Giá trị/buổi</th>
                </tr>
              </thead>
              <tbody>
                {allocation.components.map((c) => (
                  <tr key={c.serviceId} className="border-border border-b last:border-0">
                    <td className="px-3 py-2.5">{c.serviceName}</td>
                    <td className="tabular px-3 py-2.5 text-right">
                      {c.sessions}
                      {c.bonusSessions ? (
                        <span className="text-success"> +{c.bonusSessions}</span>
                      ) : null}
                    </td>
                    <td className="tabular text-muted-foreground px-3 py-2.5 text-right">
                      {formatMoney(c.retailPrice)}
                    </td>
                    <td className="tabular text-muted-foreground px-3 py-2.5 text-right">
                      {formatPercent(c.share * 100)}
                    </td>
                    <td className="tabular px-3 py-2.5 text-right font-medium">
                      {formatMoney(c.allocatedPerSession)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-border border-t-2">
                  <td className="px-3 py-2.5 font-medium" colSpan={2}>
                    Mua rời từng buổi
                  </td>
                  <td className="tabular px-3 py-2.5 text-right" colSpan={3}>
                    {formatMoney(allocation.retailTotal)} đ
                  </td>
                </tr>
                <tr>
                  <td className="px-3 py-2.5 font-medium" colSpan={2}>
                    Giá gói
                  </td>
                  <td className="tabular px-3 py-2.5 text-right font-semibold" colSpan={3}>
                    {formatMoney(allocation.packagePrice)} đ
                  </td>
                </tr>
                {allocation.discountAmount > 0 && (
                  <tr className="text-success">
                    <td className="px-3 py-2.5 font-medium" colSpan={2}>
                      Khách tiết kiệm
                    </td>
                    <td className="tabular px-3 py-2.5 text-right font-semibold" colSpan={3}>
                      {formatMoney(allocation.discountAmount)} đ (
                      {formatPercent(allocation.discountRatio * 100)})
                    </td>
                  </tr>
                )}
              </tfoot>
            </table>
          </div>
        </section>
      )}

      {/* Dịch vụ: định mức nguyên vật liệu */}
      {materials.length > 0 && (
        <section className="border-border bg-card rounded-lg border p-5">
          <h2 className="font-semibold">Định mức nguyên vật liệu</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Làm xong một buổi thì trừ kho theo đúng định mức này.
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            {materials.map((m) => (
              <li
                key={m.materialId}
                className="border-border flex items-center justify-between gap-3 border-b pb-2 last:border-0"
              >
                <span>{m.materialName}</span>
                <span className="tabular text-muted-foreground">
                  {formatQuantity(m.quantity)} {m.unitName ?? ''}
                  {showCost && <> · {formatMoney(Number(m.quantity) * Number(m.cost))} đ</>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Sản phẩm: tồn kho theo chi nhánh */}
      {stock.length > 0 && (
        <section className="border-border bg-card rounded-lg border p-5">
          <h2 className="font-semibold">Tồn kho</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {stock.map((s) => (
              <li key={s.branchId} className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Chi nhánh</span>
                <span className="tabular font-medium">
                  {formatQuantity(s.onHand)} {product.unitName ?? ''}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
