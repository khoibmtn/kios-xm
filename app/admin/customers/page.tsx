import { asc, eq, sql } from 'drizzle-orm'
import { requirePermission, can } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { customerGroups, customers } from '@/lib/schema'
import { CustomerTable, type CustomerRow } from './customer-table'

export const metadata = { title: 'Khách hàng' }
export const dynamic = 'force-dynamic'

/**
 * Một ô "khu vực" gộp từ bốn cột địa lý.
 *
 * Dữ liệu chuyển từ hệ cũ nằm rải ở cột mới lẫn cột trước sáp nhập 2025, khách
 * nào có gì thì hiện nấy — chứ hiện một cột thì 3/4 danh sách trống trơn. Bỏ
 * phần trùng vì nhiều hồ sơ có phường mới **giống hệt** phường cũ (KiotViet
 * chép sang khi sáp nhập), ghép thẳng sẽ ra "Phường Lưu Kiếm, …, Phường Lưu
 * Kiếm".
 */
function joinArea(parts: (string | null)[]): string | null {
  const seen = new Set<string>()
  for (const part of parts) {
    const value = part?.trim()
    if (value) seen.add(value)
  }
  return seen.size > 0 ? [...seen].join(', ') : null
}

export default async function CustomersPage() {
  const user = await requirePermission('customer.view')

  const found = await db
    .select({
      id: customers.id,
      code: customers.code,
      name: customers.name,
      phone: customers.phone,
      gender: customers.gender,
      birthday: customers.birthday,
      province: customers.province,
      ward: customers.ward,
      formerArea: customers.formerArea,
      formerWard: customers.formerWard,
      source: customers.source,
      groupName: customerGroups.name,
      note: customers.note,
      isActive: customers.isActive,
      migratedVisits: customers.migratedVisits,
      migratedTotalSpent: customers.migratedTotalSpent,
      /*
       * Buổi còn lại đọc **sống từ gói khách đang giữ**, không đọc
       * `customers.migrated_remaining_sessions` nữa.
       *
       * Cột kia là ảnh chụp lúc chuyển hệ và nó còn thấp hơn sự thật: KiotViet
       * đã trừ đi phần buổi giữ chỗ cho lịch hẹn, nên nó ghi 19 trong khi spa
       * thật sự còn nợ khách 26 buổi. Để hai con số cùng tồn tại là dựng lại
       * đúng cái bẫy "một cột hai nghĩa" của `categories.path`.
       */
      remainingSessions: sql<number>`(
        select coalesce(sum(i.sessions + i.bonus_sessions - i.used_sessions), 0)::int
        from customer_package_items i
        join customer_packages p on p.id = i.customer_package_id
        where p.customer_id = ${customers.id}
          and p.status in ('active', 'used_up')
      )`,
      lastVisitAt: customers.lastVisitAt,
    })
    .from(customers)
    .leftJoin(customerGroups, eq(customerGroups.id, customers.groupId))
    .where(eq(customers.tenantId, user.tenantId))
    .orderBy(asc(customers.name))

  const rows: CustomerRow[] = found.map(({ province, ward, formerArea, formerWard, ...rest }) => ({
    ...rest,
    area: joinArea([ward, province, formerWard, formerArea]),
  }))

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Khách hàng</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Hồ sơ khách, lịch sử chi tiêu và số buổi còn lại trong gói liệu trình.
        </p>
      </div>

      <CustomerTable rows={rows} canManage={can(user, 'customer.manage')} />
    </div>
  )
}
