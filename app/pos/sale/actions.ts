'use server'

import { revalidatePath } from 'next/cache'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { assertPermission, ForbiddenError } from '@/lib/auth/session'
import { db } from '@/lib/db'
import {
  cashAccounts,
  customerPackageItems,
  invoiceItems,
  invoices,
  packageTransactions,
  payments,
  products,
} from '@/lib/schema'
import { writeAudit } from '@/lib/audit'

export interface CheckoutLine {
  productId: string
  quantity: number
  /** Đơn giá lễ tân thấy trên màn hình — chốt lại tại đây, không tra lại giá. */
  unitPrice: number
  discountAmount: number
  /** Nếu dòng này trừ buổi từ gói khách đang giữ. */
  customerPackageItemId?: string
  /** Buổi đã hẹn tương ứng, nếu bán từ lịch hẹn (`AGENTS.md` §3b.2). */
  bookingItemId?: string
  performerEmployeeId?: string
}

export interface CheckoutInput {
  customerId?: string
  guestName?: string
  lines: CheckoutLine[]
  invoiceDiscount: number
  saleChannelId?: string
  note?: string
  /** Bỏ trống nghĩa là chưa thu tiền — hoá đơn vẫn ở trạng thái đang bán. */
  payment?: { method: 'cash' | 'bank' | 'wallet'; amount: number }
}

export interface CheckoutResult {
  ok: boolean
  invoiceId?: string
  code?: string
  error?: string
}

const money = (n: number) => Math.max(0, Math.round(n))

/**
 * Lập hoá đơn và thu tiền.
 *
 * Ba thứ phải xảy ra cùng nhau hoặc không xảy ra gì: hoá đơn, các dòng hàng, và
 * phiếu thanh toán. Nên tất cả nằm trong **một giao dịch** — bài học từ lịch
 * hẹn hôm nay, nơi một lần đặt trùng giờ để lại phiếu rỗng vì hai câu chèn
 * đứng rời nhau.
 *
 * Buổi trừ từ gói đi qua sổ cái `package_transactions` (`AGENTS.md` §3b.6),
 * không UPDATE thẳng `used_sessions`. Và giá trị buổi đó vào
 * `service_allocated_value` chứ **không** vào `total`: tiền đã thu từ hôm bán
 * gói, cộng vào doanh thu là đếm hai lần (§3b.5).
 */
export async function checkoutAction(input: CheckoutInput): Promise<CheckoutResult> {
  let user
  try {
    user = await assertPermission('invoice.create')
  } catch (e) {
    if (e instanceof ForbiddenError) return { ok: false, error: 'Bạn không có quyền lập hoá đơn.' }
    throw e
  }

  if (input.lines.length === 0) return { ok: false, error: 'Hoá đơn phải có ít nhất một dòng.' }
  if (!input.customerId && !input.guestName?.trim()) {
    return { ok: false, error: 'Chọn khách hàng hoặc nhập tên khách vãng lai.' }
  }

  try {
    const productIds = [...new Set(input.lines.map((l) => l.productId))]
    const [found, accounts] = await Promise.all([
      db
        .select({ id: products.id, name: products.name, kind: products.kind })
        .from(products)
        .where(and(eq(products.tenantId, user.tenantId), inArray(products.id, productIds))),
      input.payment
        ? db
            .select({ id: cashAccounts.id, kind: cashAccounts.kind })
            .from(cashAccounts)
            .where(eq(cashAccounts.tenantId, user.tenantId))
        : Promise.resolve([]),
    ])

    const byId = new Map(found.map((p) => [p.id, p]))
    if (productIds.some((id) => !byId.has(id))) {
      return { ok: false, error: 'Có mặt hàng không còn trong danh mục.' }
    }

    /*
     * Đơn giá phân bổ của buổi trong gói — dùng làm `allocated_value`. Lấy từ
     * ảnh chụp lúc bán gói (§3b.4), không tính lại từ bảng giá hiện hành.
     */
    const packageItemIds = input.lines
      .map((l) => l.customerPackageItemId)
      .filter((v): v is string => !!v)
    const allocatedByItem = new Map<string, number>()
    if (packageItemIds.length > 0) {
      const rows = await db
        .select({
          id: customerPackageItems.id,
          perSession: customerPackageItems.allocatedPerSession,
        })
        .from(customerPackageItems)
        .where(inArray(customerPackageItems.id, packageItemIds))
      for (const r of rows) allocatedByItem.set(r.id, Number(r.perSession))
    }

    const lines = input.lines.map((l, i) => {
      const quantity = Math.max(1, Math.round(l.quantity))
      const usesPackage = !!l.customerPackageItemId
      const unitPrice = usesPackage ? 0 : money(l.unitPrice)
      const discountAmount = usesPackage ? 0 : Math.min(money(l.discountAmount), unitPrice)
      const salePrice = unitPrice - discountAmount
      const allocated = usesPackage
        ? money((allocatedByItem.get(l.customerPackageItemId!) ?? 0) * quantity)
        : 0
      return {
        ...l,
        sortOrder: i,
        productName: byId.get(l.productId)!.name,
        quantity,
        unitPrice,
        discountAmount,
        discountRatio: unitPrice > 0 ? Math.round((discountAmount / unitPrice) * 100) : 0,
        salePrice,
        lineTotal: salePrice * quantity,
        allocatedValue: allocated,
      }
    })

    const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0)
    const invoiceDiscount = Math.min(money(input.invoiceDiscount), subtotal)
    const total = subtotal - invoiceDiscount
    const allocatedTotal = lines.reduce((s, l) => s + l.allocatedValue, 0)

    if (input.payment && input.payment.amount > total) {
      return { ok: false, error: 'Số tiền thu lớn hơn số khách phải trả.' }
    }

    const [maxRow] = await db
      .select({ code: sql<string>`max(${invoices.code})` })
      .from(invoices)
      .where(eq(invoices.tenantId, user.tenantId))
    const next = Number.parseInt((maxRow?.code ?? '').replace(/\D/g, ''), 10)
    const code = `HD${String(Number.isFinite(next) ? next + 1 : 1).padStart(6, '0')}`

    const accountId = input.payment
      ? (accounts.find((a) => a.kind === input.payment!.method)?.id ?? null)
      : null

    const invoice = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(invoices)
        .values({
          tenantId: user.tenantId,
          branchId: user.branchId,
          code,
          customerId: input.customerId ?? null,
          guestName: input.customerId ? null : (input.guestName?.trim() ?? null),
          // Thu đủ thì hoàn tất ngay; thu thiếu hoặc chưa thu thì vẫn đang bán.
          status: input.payment && input.payment.amount >= total ? 'completed' : 'draft',
          saleChannelId: input.saleChannelId ?? null,
          subtotal: String(subtotal),
          discountAmount: String(invoiceDiscount),
          discountRatio: String(subtotal > 0 ? Math.round((invoiceDiscount / subtotal) * 100) : 0),
          total: String(total),
          serviceAllocatedValue: String(allocatedTotal),
          note: input.note?.trim() || null,
          createdByUserId: user.id,
        })
        .returning({ id: invoices.id, code: invoices.code })

      const items = await tx
        .insert(invoiceItems)
        .values(
          lines.map((l) => ({
            invoiceId: created.id,
            tenantId: user.tenantId,
            productId: l.productId,
            productName: l.productName,
            bookingItemId: l.bookingItemId ?? null,
            quantity: String(l.quantity),
            unitPrice: String(l.unitPrice),
            discountRatio: String(l.discountRatio),
            discountAmount: String(l.discountAmount),
            salePrice: String(l.salePrice),
            lineTotal: String(l.lineTotal),
            customerPackageItemId: l.customerPackageItemId ?? null,
            allocatedValue: String(l.allocatedValue),
            sortOrder: l.sortOrder,
          })),
        )
        .returning({ id: invoiceItems.id, sortOrder: invoiceItems.sortOrder })

      // §3b.6 — trừ buổi qua sổ cái, không UPDATE thẳng `used_sessions`.
      const usage = lines
        .map((l, i) => ({ line: l, itemId: items.find((it) => it.sortOrder === i)?.id }))
        .filter((x) => x.line.customerPackageItemId && x.itemId)
      if (usage.length > 0) {
        await tx.insert(packageTransactions).values(
          usage.map(({ line, itemId }) => ({
            tenantId: user.tenantId,
            customerPackageItemId: line.customerPackageItemId!,
            type: 'use' as const,
            quantity: -line.quantity,
            allocatedValue: String(line.allocatedValue),
            invoiceItemId: itemId!,
            bookingItemId: line.bookingItemId ?? null,
            performerEmployeeId: line.performerEmployeeId ?? null,
            createdByUserId: user.id,
            note: `Dùng buổi từ gói khi bán ${created.code}`,
          })),
        )
      }

      if (input.payment && input.payment.amount > 0) {
        // Mã phiếu thu = TT + mã hoá đơn, đúng quy ước quan sát ở KiotViet.
        await tx.insert(payments).values({
          tenantId: user.tenantId,
          invoiceId: created.id,
          code: `TT${created.code}`,
          method: input.payment.method,
          amount: String(money(input.payment.amount)),
          cashAccountId: accountId,
          createdByUserId: user.id,
        })
      }

      return created
    })

    await writeAudit({
      tenantId: user.tenantId,
      userId: user.id,
      entity: 'invoice',
      entityId: invoice.id,
      action: 'create',
      after: { code: invoice.code, total, lines: lines.length, allocated: allocatedTotal },
      reason: `Lập hoá đơn ${invoice.code}`,
    })
    revalidatePath('/pos/sale')
    revalidatePath('/admin/customers')

    return { ok: true, invoiceId: invoice.id, code: invoice.code }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('[checkoutAction]', message)
    if (message.includes('invoice_items_booking_item_key')) {
      return { ok: false, error: 'Buổi này đã được tính tiền trong một hoá đơn khác.' }
    }
    if (message.includes('customer_package_items_used_within_bounds')) {
      return { ok: false, error: 'Gói của khách không còn đủ buổi.' }
    }
    return { ok: false, error: 'Không lập được hoá đơn. Chi tiết đã được ghi lại.' }
  }
}
