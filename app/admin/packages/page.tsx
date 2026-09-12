import { desc, eq, sql } from 'drizzle-orm'
import { requirePermission, can } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { customerPackageItems, customerPackages, customers } from '@/lib/schema'
import { PackageTable, type PackageRow } from './package-table'

export const metadata = { title: 'Gói, thẻ đã bán' }
export const dynamic = 'force-dynamic'

export default async function PackagesPage() {
  const user = await requirePermission('package.view')

  /*
   * Một gói có thể gồm nhiều dịch vụ (nhiều dòng ở `customer_package_items`),
   * nên phải SUM/string_agg qua `leftJoin` — không đọc thẳng một hàng item.
   * `coalesce(..., 0)` phòng trường hợp gói chưa có item nào (leftJoin không
   * khớp) để tổng buổi ra 0 thay vì NULL làm hỏng phép cộng ở client.
   */
  const totalSessions = sql<number>`coalesce(sum(${customerPackageItems.sessions} + ${customerPackageItems.bonusSessions}), 0)::int`
  const usedSessions = sql<number>`coalesce(sum(${customerPackageItems.usedSessions}), 0)::int`
  const remainingSessions = sql<number>`coalesce(sum(${customerPackageItems.sessions} + ${customerPackageItems.bonusSessions} - ${customerPackageItems.usedSessions}), 0)::int`
  const reservedSessions = sql<number>`coalesce(sum(${customerPackageItems.migratedReservedSessions}), 0)::int`
  // NULL khi gói chưa có item nào — hiếm nhưng có thể xảy ra nếu dữ liệu lỗi.
  const serviceName = sql<
    string | null
  >`string_agg(distinct ${customerPackageItems.serviceName}, ', ')`

  const found = await db
    .select({
      id: customerPackages.id,
      code: customerPackages.code,
      packageName: customerPackages.packageName,
      customerName: customers.name,
      customerCode: customers.code,
      soldAt: customerPackages.soldAt,
      expiresAt: customerPackages.expiresAt,
      price: customerPackages.price,
      status: customerPackages.status,
      migratedAt: customerPackages.migratedAt,
      serviceName,
      totalSessions,
      usedSessions,
      remainingSessions,
      reservedSessions,
    })
    .from(customerPackages)
    .innerJoin(customers, eq(customers.id, customerPackages.customerId))
    .leftJoin(customerPackageItems, eq(customerPackageItems.customerPackageId, customerPackages.id))
    .where(eq(customerPackages.tenantId, user.tenantId))
    // `customerPackages.id` và `customers.id` là khoá chính của đúng bảng chứa
    // các cột còn lại trong SELECT, nên Postgres cho phép chọn thẳng các cột
    // đó (phụ thuộc hàm vào khoá chính) mà không cần liệt kê hết trong GROUP BY.
    .groupBy(customerPackages.id, customers.id)
    .orderBy(desc(sql`${remainingSessions} > 0`), desc(customerPackages.soldAt))

  const rows: PackageRow[] = found.map(({ migratedAt, ...rest }) => ({
    ...rest,
    isMigrated: migratedAt !== null,
  }))

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Gói, thẻ đã bán</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Gói/liệu trình khách đã mua, số buổi đã dùng và còn lại.
        </p>
      </div>

      <PackageTable rows={rows} canManage={can(user, 'package.sell')} />
    </div>
  )
}
