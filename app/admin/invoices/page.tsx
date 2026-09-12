import { desc, eq, sql } from 'drizzle-orm'
import { requirePermission, can } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { customers, invoices, payments } from '@/lib/schema'
import { InvoiceTable, type InvoiceRow } from './invoice-table'

export const metadata = { title: 'Hoá đơn' }
export const dynamic = 'force-dynamic'

export default async function InvoicesPage() {
  const user = await requirePermission('invoice.view')

  // Gộp theo DISTINCT — an toàn dù `payments` bị nhân chéo bởi leftJoin khác,
  // vì string_agg(DISTINCT …) chỉ quan tâm tập giá trị duy nhất, không quan tâm
  // có bao nhiêu dòng trùng đứng sau join.
  const paymentMethods = sql<string | null>`string_agg(distinct ${payments.method}::text, ', ')`

  const found = await db
    .select({
      id: invoices.id,
      code: invoices.code,
      status: invoices.status,
      issuedAt: invoices.issuedAt,
      customerName: customers.name,
      guestName: invoices.guestName,
      subtotal: invoices.subtotal,
      discountAmount: invoices.discountAmount,
      total: invoices.total,
      serviceAllocatedValue: invoices.serviceAllocatedValue,
      paidAmount: invoices.paidAmount,
      // Đếm bằng truy vấn con thay vì `count()` trên join: join thêm `payments`
      // để gộp phương thức thanh toán sẽ nhân chéo số dòng `invoice_items`, lúc
      // đó `count()` trên kết quả join ra con số sai (nhân theo số payments).
      itemCount: sql<number>`(
        select count(*)::int
        from invoice_items
        where invoice_id = ${invoices.id}
      )`,
      paymentMethods,
    })
    .from(invoices)
    .leftJoin(customers, eq(customers.id, invoices.customerId))
    .leftJoin(payments, eq(payments.invoiceId, invoices.id))
    .where(eq(invoices.tenantId, user.tenantId))
    // `invoices.id` và `customers.id` là khoá chính của đúng bảng chứa các cột
    // còn lại trong SELECT, nên Postgres cho phép chọn thẳng các cột đó (phụ
    // thuộc hàm vào khoá chính) mà không cần liệt kê hết trong GROUP BY.
    .groupBy(invoices.id, customers.id)
    .orderBy(desc(invoices.issuedAt))

  const rows: InvoiceRow[] = found.map(({ customerName, guestName, ...rest }) => ({
    ...rest,
    customerName: customerName ?? guestName ?? 'Khách lẻ',
  }))

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Hoá đơn</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Toàn bộ hoá đơn đã lập, số tiền khách cần trả và số tiền đã thu.
        </p>
      </div>

      <InvoiceTable rows={rows} canManage={can(user, 'invoice.return')} />
    </div>
  )
}
