'use server'

import { revalidatePath } from 'next/cache'
import { eq, inArray, and } from 'drizzle-orm'
import { assertPermission, ForbiddenError } from '@/lib/auth/session'
import { db } from '@/lib/db'
import {
  customerPackageItems,
  customerPackages,
  customers,
  packageTransactions,
  products,
} from '@/lib/schema'
import { writeAudit } from '@/lib/audit'
import type { PackageImportRow } from '@/lib/packages/import-map'

export interface PackageImportOutcome {
  line: number
  code: string
  status: 'created' | 'skipped' | 'failed'
  customerName: string
  remaining: number
  message?: string
}

export interface PackageImportResult {
  outcomes: PackageImportOutcome[]
  error?: string
}

const MAX_ROWS = 100

/** Khớp tên bỏ qua hoa thường và khoảng trắng thừa — KiotViet gõ tay không đều. */
const key = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

/**
 * Nhập gói/liệu trình khách đang giữ từ bản xuất "Thẻ dịch vụ" của KiotViet.
 *
 * Theo lô, không theo dòng: Cloudflare giới hạn 50 subrequest mỗi request, và
 * bản nhập hàng hoá đầu tiên đã chết sau đúng chín dòng vì tra cứu từng dòng
 * một (xem `PROGRESS.md` 07/09). Ở đây tổng số truy vấn là **hằng số** — tra
 * khách và hàng hoá một lần, rồi ba câu chèn.
 *
 * Số buổi đi vào sổ cái chứ không ghi thẳng vào cột (`AGENTS.md` §3b.6): mỗi
 * gói sinh một giao dịch `grant` bằng tổng số buổi, và nếu khách đã dùng thì
 * thêm một `use` âm. Trigger tự tính `used_sessions`. Làm vậy thì ngay từ hàng
 * đầu tiên, lịch sử đã có chỗ đứng — về sau POS trừ buổi cũng ghi vào đúng chỗ
 * này, không phải bịa ra một đường ghi thứ hai.
 */
export async function importPackagesAction(rows: PackageImportRow[]): Promise<PackageImportResult> {
  let user
  try {
    // Nhập gói đã bán = ghi nhận việc bán gói, nên đi cùng quyền `package.sell`
    user = await assertPermission('package.sell')
  } catch (e) {
    if (e instanceof ForbiddenError) return { outcomes: [], error: 'Bạn không có quyền.' }
    throw e
  }

  if (rows.length > MAX_ROWS) return { outcomes: [], error: `Mỗi lô tối đa ${MAX_ROWS} dòng.` }
  if (rows.length === 0) return { outcomes: [] }

  const outcomes: PackageImportOutcome[] = []

  try {
    // ── Tra cứu một lần cho cả lô ──────────────────────────────────────────
    const [allCustomers, allProducts, existing] = await Promise.all([
      db
        .select({ id: customers.id, name: customers.name, phone: customers.phone })
        .from(customers)
        .where(eq(customers.tenantId, user.tenantId)),
      db
        .select({ id: products.id, name: products.name, kind: products.kind })
        .from(products)
        .where(eq(products.tenantId, user.tenantId)),
      db
        .select({ code: customerPackages.code })
        .from(customerPackages)
        .where(
          and(
            eq(customerPackages.tenantId, user.tenantId),
            inArray(
              customerPackages.code,
              rows.map((r) => r.code),
            ),
          ),
        ),
    ])

    /*
     * Tên khách trùng nhau thì không đoán bừa. Giữ cả danh sách id cho mỗi tên;
     * trùng tên mà không có số điện thoại để phân biệt thì báo dòng đó, chứ gán
     * gói cho nhầm người là sai một thứ khách sẽ đến đòi.
     */
    const customersByName = new Map<string, { id: string; phone: string | null }[]>()
    for (const c of allCustomers) {
      const k = key(c.name)
      customersByName.set(k, [...(customersByName.get(k) ?? []), { id: c.id, phone: c.phone }])
    }
    const productByName = new Map(allProducts.map((p) => [`${p.kind}:${key(p.name)}`, p.id]))
    const alreadyImported = new Set(existing.map((e) => e.code))

    // ── Dựng dữ liệu cho ba câu chèn ──────────────────────────────────────
    const packageValues: (typeof customerPackages.$inferInsert)[] = []
    const pending: { row: PackageImportRow; serviceId: string | null }[] = []
    const migratedAt = new Date()

    for (const row of rows) {
      if (alreadyImported.has(row.code)) {
        outcomes.push({
          line: row.line,
          code: row.code,
          status: 'skipped',
          customerName: row.customerName,
          remaining: row.remainingSessions,
          message: 'Đã nhập trước đó',
        })
        continue
      }

      const candidates = customersByName.get(key(row.customerName)) ?? []
      let customerId: string | undefined
      if (candidates.length === 1) {
        customerId = candidates[0].id
      } else if (candidates.length > 1) {
        const digits = row.customerPhone.replace(/\D/g, '')
        const matched = digits
          ? candidates.filter((c) => (c.phone ?? '').replace(/\D/g, '') === digits)
          : []
        if (matched.length === 1) customerId = matched[0].id
      }

      if (!customerId) {
        outcomes.push({
          line: row.line,
          code: row.code,
          status: 'failed',
          customerName: row.customerName,
          remaining: row.remainingSessions,
          message:
            candidates.length === 0
              ? `Không tìm thấy khách "${row.customerName}"`
              : `Có ${candidates.length} khách trùng tên "${row.customerName}", không đủ căn cứ chọn`,
        })
        continue
      }

      packageValues.push({
        tenantId: user.tenantId,
        branchId: user.branchId,
        customerId,
        packageId: productByName.get(`package:${key(row.packageName)}`) ?? null,
        code: row.code,
        packageName: row.packageName,
        soldAt: row.soldAt || null,
        expiresAt: row.expiresAt || null,
        price: row.price || '0',
        migratedAt,
        note: row.invoiceCode ? `Hoá đơn gốc ${row.invoiceCode} bên KiotViet` : null,
        createdByUserId: user.id,
      } as typeof customerPackages.$inferInsert)

      pending.push({ row, serviceId: productByName.get(`service:${key(row.serviceName)}`) ?? null })
    }

    if (packageValues.length === 0) return { outcomes }

    const inserted = await db
      .insert(customerPackages)
      .values(packageValues)
      .returning({ id: customerPackages.id, code: customerPackages.code })

    const packageIdByCode = new Map(inserted.map((p) => [p.code, p.id]))

    /*
     * §3b.4 — giá trị mỗi buổi chốt từ **giá khách thật sự trả**, không phải giá
     * niêm yết: có gói bán 3.052.198đ vì được giảm, lấy giá niêm yết thì hoa
     * hồng và báo cáo về sau đều lệch. Mỗi gói ở đây chỉ có một dịch vụ nên
     * phân bổ là phép chia; khi bán gói nhiều dịch vụ thì dùng
     * `allocatePackageValue` trong `lib/catalog/package-allocation.ts`.
     */
    const itemValues = pending.map(({ row, serviceId }, i) => ({
      customerPackageId: packageIdByCode.get(row.code)!,
      serviceId,
      serviceName: row.serviceName,
      sessions: row.totalSessions,
      allocatedPerSession: String(
        Math.round(Number(row.price || 0) / Math.max(row.totalSessions, 1)),
      ),
      migratedReservedSessions: row.reservedSessions,
      sortOrder: i,
    }))

    const items = await db
      .insert(customerPackageItems)
      .values(itemValues)
      .returning({
        id: customerPackageItems.id,
        customerPackageId: customerPackageItems.customerPackageId,
      })

    const itemIdByPackage = new Map(items.map((it) => [it.customerPackageId, it.id]))

    const txnValues: (typeof packageTransactions.$inferInsert)[] = []
    for (const { row } of pending) {
      const itemId = itemIdByPackage.get(packageIdByCode.get(row.code)!)
      if (!itemId) continue
      const perSession = Math.round(Number(row.price || 0) / Math.max(row.totalSessions, 1))

      txnValues.push({
        tenantId: user.tenantId,
        customerPackageItemId: itemId,
        type: 'grant',
        quantity: row.totalSessions,
        occurredAt: row.soldAt ? new Date(row.soldAt) : migratedAt,
        createdByUserId: user.id,
        note: 'Chuyển từ KiotViet',
      })

      const consumed = row.usedSessions + row.returnedSessions
      if (consumed > 0) {
        txnValues.push({
          tenantId: user.tenantId,
          customerPackageItemId: itemId,
          type: 'use',
          quantity: -consumed,
          allocatedValue: String(perSession * consumed),
          /*
           * Gộp tất cả buổi đã dùng vào một dòng, đề ngày dùng gần nhất. Bản
           * xuất của KiotViet chỉ cho biết *bao nhiêu* buổi đã dùng chứ không
           * cho từng lần, nên tách ra nhiều dòng là bịa ngày. Một dòng nói đúng
           * những gì biết.
           */
          occurredAt: row.lastUsedAt ? new Date(row.lastUsedAt) : migratedAt,
          createdByUserId: user.id,
          note: `Chuyển từ KiotViet — gộp ${consumed} buổi đã dùng trước khi sang phần mềm này`,
        })
      }

      outcomes.push({
        line: row.line,
        code: row.code,
        status: 'created',
        customerName: row.customerName,
        remaining: row.remainingSessions,
      })
    }

    if (txnValues.length > 0) await db.insert(packageTransactions).values(txnValues)

    await writeAudit({
      tenantId: user.tenantId,
      userId: user.id,
      entity: 'customer_package',
      entityId: user.tenantId,
      action: 'create',
      after: { imported: pending.length },
      reason: `Nhập ${pending.length} gói dịch vụ khách đang giữ từ tệp`,
    })
    revalidatePath('/admin/packages')

    return { outcomes }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('[importPackagesAction]', message)
    return { outcomes, error: 'Lô này ghi không thành công. Chi tiết đã được ghi lại.' }
  }
}
