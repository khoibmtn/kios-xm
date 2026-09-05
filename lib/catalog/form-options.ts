import { and, asc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { brands, categories, products, units } from '@/lib/schema'

/**
 * numeric của Postgres về tới đây là chuỗi "500000.00". Ô nhập tiền và schema
 * đều làm việc với số đồng thuần, còn dấu chấm trong chuỗi đó lại trùng đúng
 * ký tự người Việt dùng để ngăn nghìn — để nguyên là mời một lỗi nhân trăm.
 */
function toAmount(v: string | null): string {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? String(Math.round(n)) : '0'
}

/** Dữ liệu đổ vào các ô chọn của form hàng hoá. */
export async function loadFormOptions(tenantId: string) {
  const [categoryRows, brandRows, unitRows, serviceRows, materialRows] = await Promise.all([
    db
      .select({ value: categories.id, label: categories.name })
      .from(categories)
      .where(and(eq(categories.tenantId, tenantId), eq(categories.isActive, true)))
      .orderBy(asc(categories.sortOrder), asc(categories.name)),

    db
      .select({ value: brands.id, label: brands.name })
      .from(brands)
      .where(and(eq(brands.tenantId, tenantId), eq(brands.isActive, true)))
      .orderBy(asc(brands.name)),

    db
      .select({ value: units.id, label: units.name })
      .from(units)
      .where(and(eq(units.tenantId, tenantId), eq(units.isActive, true)))
      .orderBy(asc(units.name)),

    // Chỉ dịch vụ mới được đưa vào gói
    db
      .select({ value: products.id, label: products.name, price: products.basePrice })
      .from(products)
      .where(
        and(
          eq(products.tenantId, tenantId),
          eq(products.kind, 'service'),
          eq(products.isActive, true),
        ),
      )
      .orderBy(asc(products.name)),

    // Chỉ hàng vật lý mới làm nguyên vật liệu tiêu hao
    db
      .select({ value: products.id, label: products.name, price: products.cost })
      .from(products)
      .where(
        and(
          eq(products.tenantId, tenantId),
          eq(products.kind, 'product'),
          eq(products.isActive, true),
        ),
      )
      .orderBy(asc(products.name)),
  ])

  return {
    categories: categoryRows,
    brands: brandRows,
    units: unitRows,
    services: serviceRows.map((r) => ({ ...r, price: toAmount(r.price) })),
    materials: materialRows.map((r) => ({ ...r, price: toAmount(r.price) })),
  }
}
