'use server'

import { revalidatePath } from 'next/cache'
import { and, eq } from 'drizzle-orm'
import { assertPermission, ForbiddenError } from '@/lib/auth/session'
import { db } from '@/lib/db'
import {
  cashTransactions,
  invoiceItems,
  invoices,
  packageTransactions,
  payments,
} from '@/lib/schema'
import { writeAudit } from '@/lib/audit'

export interface CancelInvoiceResult {
  ok: boolean
  error?: string
  /** Số buổi đã hoàn lại gói, để báo cho người bấm biết việc gì vừa xảy ra. */
  restoredSessions?: number
  reversedAmount?: number
}

/**
 * Huỷ hoá đơn bằng **bút toán ngược**, không xoá gì.
 *
 * Đây là chỗ dễ làm hỏng dữ liệu thật nhất trong cả phần mềm, nên nói rõ:
 *
 *  - Buổi khách đã dùng được **hoàn lại bằng một giao dịch `adjust` dương**
 *    trong `package_transactions` (`AGENTS.md` §3b.6), chứ không sửa
 *    `used_sessions` và cũng không xoá dòng `use` cũ. Lịch sử phải đọc được
 *    theo trình tự: đã dùng, rồi đã hoàn.
 *  - Tiền đã thu được **đảo bằng một phiếu chi** trong sổ quỹ, mã `HT` + mã
 *    phiếu thu. Phiếu thu cũ đứng nguyên. Sổ quỹ mà xoá được thì không còn là
 *    sổ quỹ.
 *  - `invoices.paid_amount` **không** bị đụng tới: nó là ảnh chụp số tiền hoá
 *    đơn này đã thu, và việc đó có thật. Số dư quỹ mới là thứ phải về đúng.
 *
 * Trước migration 0013 thì xoá hoá đơn còn *không* hoàn buổi lại cho khách —
 * cột `invoice_item_id` không có khoá ngoại nên chẳng ai chặn. Giờ nó
 * `RESTRICT`: muốn bỏ một hoá đơn đã trừ buổi thì buộc phải đi đường này.
 */
export async function cancelInvoiceAction(
  invoiceId: string,
  note: string,
): Promise<CancelInvoiceResult> {
  let user
  try {
    user = await assertPermission('invoice.return')
  } catch (e) {
    if (e instanceof ForbiddenError) return { ok: false, error: 'Bạn không có quyền huỷ hoá đơn.' }
    throw e
  }

  if (!note.trim()) return { ok: false, error: 'Phải ghi lý do huỷ hoá đơn.' }

  try {
    const [invoice] = await db
      .select({
        id: invoices.id,
        code: invoices.code,
        status: invoices.status,
        branchId: invoices.branchId,
      })
      .from(invoices)
      .where(and(eq(invoices.tenantId, user.tenantId), eq(invoices.id, invoiceId)))

    if (!invoice) return { ok: false, error: 'Không tìm thấy hoá đơn.' }
    if (invoice.status === 'cancelled') return { ok: false, error: 'Hoá đơn này đã huỷ rồi.' }

    const [usedSessions, paidRows] = await Promise.all([
      db
        .select({
          id: invoiceItems.id,
          packageItemId: invoiceItems.customerPackageItemId,
          quantity: invoiceItems.quantity,
          allocatedValue: invoiceItems.allocatedValue,
        })
        .from(invoiceItems)
        .where(eq(invoiceItems.invoiceId, invoiceId)),
      db
        .select({
          id: payments.id,
          code: payments.code,
          amount: payments.amount,
          cashAccountId: payments.cashAccountId,
        })
        .from(payments)
        .where(eq(payments.invoiceId, invoiceId)),
    ])

    const toRestore = usedSessions.filter((i) => i.packageItemId)
    const restoredSessions = toRestore.reduce((s, i) => s + Math.round(Number(i.quantity)), 0)
    const reversedAmount = paidRows.reduce((s, p) => s + Number(p.amount), 0)

    await db.transaction(async (tx) => {
      await tx
        .update(invoices)
        .set({ status: 'cancelled', cancelledAt: new Date(), cancelNote: note.trim() })
        .where(eq(invoices.id, invoiceId))

      if (toRestore.length > 0) {
        await tx.insert(packageTransactions).values(
          toRestore.map((i) => ({
            tenantId: user.tenantId,
            customerPackageItemId: i.packageItemId!,
            type: 'adjust' as const,
            quantity: Math.round(Number(i.quantity)),
            allocatedValue: i.allocatedValue,
            invoiceItemId: i.id,
            createdByUserId: user.id,
            // `adjust` bắt buộc có lý do ở tầng CSDL — và ba tháng sau đây là
            // câu duy nhất giải thích được vì sao buổi quay lại.
            note: `Hoàn buổi do huỷ hoá đơn ${invoice.code}: ${note.trim()}`,
          })),
        )
      }

      if (paidRows.length > 0) {
        await tx.insert(cashTransactions).values(
          paidRows.map((p) => ({
            tenantId: user.tenantId,
            branchId: invoice.branchId,
            cashAccountId: p.cashAccountId,
            code: `HT${p.code}`,
            direction: 'out' as const,
            amount: p.amount,
            invoiceId,
            // Cố ý KHÔNG gắn `payment_id`: phiếu chi này là bút toán độc lập,
            // gắn vào sẽ bị xoá theo nếu ai đó xoá phiếu thu.
            counterpart: null,
            createdByUserId: user.id,
            note: `Hoàn tiền do huỷ hoá đơn ${invoice.code}: ${note.trim()}`,
          })),
        )
      }
    })

    await writeAudit({
      tenantId: user.tenantId,
      userId: user.id,
      entity: 'invoice',
      entityId: invoiceId,
      action: 'update',
      before: { status: invoice.status },
      after: { status: 'cancelled', restoredSessions, reversedAmount },
      reason: `Huỷ hoá đơn ${invoice.code}: ${note.trim()}`,
    })
    revalidatePath('/admin/invoices')
    revalidatePath('/admin/customers')

    return { ok: true, restoredSessions, reversedAmount }
  } catch (e) {
    console.error('[cancelInvoiceAction]', e instanceof Error ? e.message : String(e))
    return { ok: false, error: 'Không huỷ được hoá đơn. Chi tiết đã được ghi lại.' }
  }
}
