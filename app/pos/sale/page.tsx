import { and, asc, eq, gt, sql } from 'drizzle-orm'
import { requirePermission } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { customerPackageItems, customerPackages, customers, products, units } from '@/lib/schema'
import { SaleScreen, type SaleProduct, type SessionOption } from './sale-screen'

export const metadata = { title: 'Bán hàng' }
export const dynamic = 'force-dynamic'

export default async function PosSalePage() {
  const user = await requirePermission('invoice.create')

  const [productList, customerList, sessionList] = await Promise.all([
    db
      .select({
        id: products.id,
        code: products.code,
        name: products.name,
        kind: products.kind,
        basePrice: products.basePrice,
        unitName: units.name,
      })
      .from(products)
      .leftJoin(units, eq(units.id, products.unitId))
      .where(
        and(
          eq(products.tenantId, user.tenantId),
          eq(products.isActive, true),
          eq(products.allowsSale, true),
        ),
      )
      .orderBy(asc(products.name)),
    db
      .select({
        id: customers.id,
        code: customers.code,
        name: customers.name,
        phone: customers.phone,
      })
      .from(customers)
      .where(and(eq(customers.tenantId, user.tenantId), eq(customers.isActive, true)))
      .orderBy(asc(customers.name)),
    /*
     * Buổi khách còn trong gói. Nạp sẵn để lễ tân thấy ngay khi chọn khách —
     * chứ nếu phải nhớ ra mà hỏi "chị còn buổi nào không" thì sớm muộn cũng có
     * lần thu tiền một buổi khách đã trả rồi.
     */
    db
      .select({
        itemId: customerPackageItems.id,
        customerId: customerPackages.customerId,
        serviceId: customerPackageItems.serviceId,
        serviceName: customerPackageItems.serviceName,
        packageName: customerPackages.packageName,
        remaining: sql<number>`(${customerPackageItems.sessions} + ${customerPackageItems.bonusSessions} - ${customerPackageItems.usedSessions})`,
      })
      .from(customerPackageItems)
      .innerJoin(customerPackages, eq(customerPackages.id, customerPackageItems.customerPackageId))
      .where(
        and(
          eq(customerPackages.tenantId, user.tenantId),
          gt(
            sql`${customerPackageItems.sessions} + ${customerPackageItems.bonusSessions} - ${customerPackageItems.usedSessions}`,
            0,
          ),
        ),
      ),
  ])

  return (
    <SaleScreen
      products={productList as SaleProduct[]}
      customers={customerList}
      sessions={sessionList.filter((s) => s.serviceId) as SessionOption[]}
    />
  )
}
