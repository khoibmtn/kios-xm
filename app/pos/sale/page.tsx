import { and, asc, eq, gt, isNull, sql } from 'drizzle-orm'
import { requirePermission } from '@/lib/auth/session'
import { db } from '@/lib/db'
import {
  bookingItems,
  bookings,
  customerPackageItems,
  customerPackages,
  customers,
  invoiceItems,
  products,
  units,
} from '@/lib/schema'
import { SaleScreen, type PresetLine, type SaleProduct, type SessionOption } from './sale-screen'

export const metadata = { title: 'Bán hàng' }
export const dynamic = 'force-dynamic'

export default async function PosSalePage({ searchParams }: PageProps<'/pos/sale'>) {
  const user = await requirePermission('invoice.create')
  const params = await searchParams
  const bookingId = typeof params.booking === 'string' ? params.booking : null

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

  /*
   * Mở từ một lịch hẹn: lấy các dòng dịch vụ của lịch đó **chưa nằm trên hoá
   * đơn nào**. `invoice_items.booking_item_id` có UNIQUE nên bán trùng sẽ bị
   * chặn ở tầng CSDL, nhưng lọc sẵn ở đây thì lễ tân không phải gặp lỗi mới
   * biết — họ chỉ thấy những buổi còn bán được.
   */
  let preset: { customerId: string | null; lines: PresetLine[] } | null = null
  if (bookingId) {
    const rows = await db
      .select({
        bookingItemId: bookingItems.id,
        productId: bookingItems.serviceId,
        serviceName: bookingItems.serviceName,
        customerId: bookings.customerId,
      })
      .from(bookingItems)
      .innerJoin(bookings, eq(bookings.id, bookingItems.bookingId))
      .leftJoin(invoiceItems, eq(invoiceItems.bookingItemId, bookingItems.id))
      .where(
        and(
          eq(bookingItems.tenantId, user.tenantId),
          eq(bookingItems.bookingId, bookingId),
          isNull(bookingItems.cancelledAt),
          isNull(invoiceItems.id),
        ),
      )
      .orderBy(asc(bookingItems.sortOrder))

    if (rows.length > 0) {
      preset = {
        customerId: rows[0].customerId,
        lines: rows
          .filter((r) => r.productId)
          .map((r) => ({
            bookingItemId: r.bookingItemId,
            productId: r.productId!,
            serviceName: r.serviceName,
          })),
      }
    }
  }

  return (
    <SaleScreen
      preset={preset}
      products={productList as SaleProduct[]}
      customers={customerList}
      sessions={sessionList.filter((s) => s.serviceId) as SessionOption[]}
    />
  )
}
