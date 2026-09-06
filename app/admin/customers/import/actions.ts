'use server'

import { revalidatePath } from 'next/cache'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { assertPermission, ForbiddenError } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { customerGroups, customers } from '@/lib/schema'
import { writeAudit } from '@/lib/audit'
import type { CustomerImportRow } from '@/lib/customers/import-map'

export interface CustomerImportOutcome {
  line: number
  status: 'created' | 'updated' | 'failed'
  name: string
  message?: string
}

export interface CustomerImportResult {
  outcomes: CustomerImportOutcome[]
  error?: string
}

const MAX_ROWS = 100

/**
 * Ghi một lô khách hàng.
 *
 * Theo lô chứ không theo dòng, cùng lý do với bộ nhập hàng hoá: Cloudflare
 * giới hạn 50 subrequest mỗi request, nên số truy vấn không được phép tăng
 * theo số dòng (xem `app/admin/products/import/actions.ts`).
 */
export async function importCustomersAction(
  rows: CustomerImportRow[],
): Promise<CustomerImportResult> {
  let user
  try {
    user = await assertPermission('customer.manage')
  } catch (e) {
    if (e instanceof ForbiddenError) return { outcomes: [], error: 'Bạn không có quyền.' }
    throw e
  }

  if (rows.length > MAX_ROWS) return { outcomes: [], error: `Mỗi lô tối đa ${MAX_ROWS} dòng.` }
  if (rows.length === 0) return { outcomes: [] }

  const outcomes: CustomerImportOutcome[] = []

  try {
    // Nhóm khách hàng: tra một lần, tạo cái còn thiếu bằng một câu
    const groupNames = [...new Set(rows.map((r) => r.groupName).filter(Boolean))]
    const groupMap = new Map<string, string>()

    if (groupNames.length > 0) {
      const existing = await db
        .select({ id: customerGroups.id, name: customerGroups.name })
        .from(customerGroups)
        .where(
          and(eq(customerGroups.tenantId, user.tenantId), inArray(customerGroups.name, groupNames)),
        )
      for (const g of existing) groupMap.set(g.name.toLowerCase(), g.id)

      const missing = groupNames.filter((n) => !groupMap.has(n.toLowerCase()))
      if (missing.length > 0) {
        const created = await db
          .insert(customerGroups)
          .values(missing.map((name) => ({ tenantId: user.tenantId, name })))
          .onConflictDoNothing()
          .returning({ id: customerGroups.id, name: customerGroups.name })
        for (const g of created) groupMap.set(g.name.toLowerCase(), g.id)
      }
    }

    const codes = rows.map((r) => r.code).filter(Boolean)
    const existingCodes = new Set(
      codes.length > 0
        ? (
            await db
              .select({ code: customers.code })
              .from(customers)
              .where(and(eq(customers.tenantId, user.tenantId), inArray(customers.code, codes)))
          ).map((r) => r.code)
        : [],
    )

    /*
     * Dòng thiếu mã thì tự sinh KH000001… Lấy mã lớn nhất một lần rồi tăng dần
     * trong bộ nhớ; UNIQUE (tenant_id, code) mới là thứ chặn trùng thật sự.
     */
    let nextCode = 1
    if (rows.some((r) => !r.code)) {
      const [row] = await db
        .select({ code: sql<string>`max(${customers.code})` })
        .from(customers)
        .where(eq(customers.tenantId, user.tenantId))
      const n = Number.parseInt((row?.code ?? '').replace(/\D/g, ''), 10)
      nextCode = Number.isFinite(n) ? n + 1 : 1
    }

    const migratedAt = new Date()

    const values = rows.map((row) => {
      const code = row.code || `KH${String(nextCode++).padStart(6, '0')}`
      return {
        tenantId: user.tenantId,
        branchId: user.branchId,
        groupId: row.groupName ? (groupMap.get(row.groupName.toLowerCase()) ?? null) : null,
        code,
        name: row.name,
        phone: row.phone || null,
        email: row.email || null,
        gender: row.gender,
        birthday: row.birthday || null,
        province: row.province || null,
        ward: row.ward || null,
        address: row.address || null,
        formerArea: row.formerArea || null,
        formerWard: row.formerWard || null,
        company: row.company || null,
        taxCode: row.taxCode || null,
        facebook: row.facebook || null,
        source: row.source || null,
        note: row.note || null,
        isActive: row.isActive,
        migratedAt,
        migratedVisits: row.visits,
        migratedTotalSpent: row.totalSpent || null,
        migratedDebt: row.debt || null,
        migratedCardBalance: row.cardBalance || null,
        migratedRemainingSessions: row.remainingSessions,
        firstVisitAt: row.firstVisitAt || null,
        lastVisitAt: row.lastVisitAt || null,
      }
    })

    await db
      .insert(customers)
      .values(values)
      .onConflictDoUpdate({
        target: [customers.tenantId, customers.code],
        set: {
          name: sql`excluded.name`,
          phone: sql`excluded.phone`,
          email: sql`excluded.email`,
          gender: sql`excluded.gender`,
          birthday: sql`excluded.birthday`,
          province: sql`excluded.province`,
          ward: sql`excluded.ward`,
          address: sql`excluded.address`,
          formerArea: sql`excluded.former_area`,
          formerWard: sql`excluded.former_ward`,
          company: sql`excluded.company`,
          taxCode: sql`excluded.tax_code`,
          facebook: sql`excluded.facebook`,
          source: sql`excluded.source`,
          groupId: sql`excluded.group_id`,
          note: sql`excluded.note`,
          isActive: sql`excluded.is_active`,
          migratedAt: sql`excluded.migrated_at`,
          migratedVisits: sql`excluded.migrated_visits`,
          migratedTotalSpent: sql`excluded.migrated_total_spent`,
          migratedDebt: sql`excluded.migrated_debt`,
          migratedCardBalance: sql`excluded.migrated_card_balance`,
          migratedRemainingSessions: sql`excluded.migrated_remaining_sessions`,
          firstVisitAt: sql`excluded.first_visit_at`,
          lastVisitAt: sql`excluded.last_visit_at`,
        },
      })

    rows.forEach((row, i) =>
      outcomes.push({
        line: row.line,
        status: existingCodes.has(values[i].code) ? 'updated' : 'created',
        name: row.name,
      }),
    )

    await writeAudit({
      tenantId: user.tenantId,
      userId: user.id,
      entity: 'customer',
      entityId: user.tenantId,
      action: 'create',
      after: { imported: rows.length },
      reason: `Nhập ${rows.length} khách hàng từ tệp`,
    })
    revalidatePath('/admin/customers')

    return { outcomes }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('[importCustomersAction]', message)
    return { outcomes, error: 'Lô này ghi không thành công. Chi tiết đã được ghi lại.' }
  }
}
