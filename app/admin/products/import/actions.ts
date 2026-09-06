'use server'

import { revalidatePath } from 'next/cache'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { assertPermission, ForbiddenError } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { brands, categories, packageItems, products, serviceMaterials, units } from '@/lib/schema'
import { writeAudit } from '@/lib/audit'
import { CODE_PREFIX, productImportSchema } from '@/lib/catalog/product-schema'
import type { ImportRow } from '@/lib/catalog/import-csv'

export interface ImportOutcome {
  line: number
  status: 'created' | 'updated' | 'failed'
  name: string
  message?: string
}

export interface ImportBatchResult {
  outcomes: ImportOutcome[]
  error?: string
}

/*
 * Vì sao mọi thứ ở đây làm theo lô chứ không theo dòng:
 *
 * Bản đầu tiên ghi từng dòng một, mỗi dòng khoảng năm truy vấn (tra nhóm hàng,
 * thương hiệu, đơn vị, tìm mã cũ, rồi ghi). Chạy thật thì Worker chết sau đúng
 * chín dòng — Cloudflare giới hạn **50 subrequest cho mỗi request**, và 9 × 5
 * vừa chạm trần. Không phải chậm, mà là cụt.
 *
 * Nên toàn bộ một lô giờ tốn một số truy vấn cố định, không phụ thuộc số dòng:
 * tra danh mục một lần, ghi hàng hoá bằng một câu `INSERT ... ON CONFLICT`.
 *
 * Đổi lại: dòng sai *dữ liệu* vẫn được chỉ đích danh (schema kiểm từng dòng
 * trước khi ghi), nhưng nếu chính câu ghi gộp đổ vì một ràng buộc cơ sở dữ
 * liệu thì chỉ biết cả lô hỏng. Chấp nhận được, vì mọi ràng buộc của bảng này
 * đều đã được schema kiểm lại ở tầng trên.
 */

const MAX_ROWS = 100

/** Tra và tạo danh mục phụ (nhóm hàng, thương hiệu, đơn vị) cho cả lô. */
async function resolveNames(
  table: typeof categories | typeof brands | typeof units,
  tenantId: string,
  names: Set<string>,
): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const wanted = [...names].filter((n) => n !== '')
  if (wanted.length === 0) return map

  const existing = await db
    .select({ id: table.id, name: table.name })
    .from(table)
    .where(and(eq(table.tenantId, tenantId), inArray(table.name, wanted)))

  for (const row of existing) map.set(row.name.toLowerCase(), row.id)

  const missing = wanted.filter((n) => !map.has(n.toLowerCase()))
  if (missing.length > 0) {
    const created = await db
      .insert(table)
      .values(missing.map((name) => ({ tenantId, name })))
      .onConflictDoNothing()
      .returning({ id: table.id, name: table.name })
    for (const row of created) map.set(row.name.toLowerCase(), row.id)
  }

  return map
}

interface PreparedRow {
  row: ImportRow
  values: Record<string, unknown>
}

/**
 * Ghi một lô hàng hoá — **lượt 1**: bản ghi hàng hoá, chưa nối thành phần.
 *
 * Nhóm hàng, thương hiệu và đơn vị tính chưa có thì tạo theo tên trong tệp —
 * đúng thứ cần khi mang cả danh mục từ phần mềm cũ sang.
 */
export async function importProductsAction(rows: ImportRow[]): Promise<ImportBatchResult> {
  let user
  try {
    user = await assertPermission('product.manage')
  } catch (e) {
    if (e instanceof ForbiddenError) return { outcomes: [], error: 'Bạn không có quyền.' }
    throw e
  }

  if (rows.length > MAX_ROWS) return { outcomes: [], error: `Mỗi lô tối đa ${MAX_ROWS} dòng.` }
  if (rows.length === 0) return { outcomes: [] }

  const outcomes: ImportOutcome[] = []

  try {
    const [categoryMap, brandMap, unitMap] = await Promise.all([
      resolveNames(categories, user.tenantId, new Set(rows.map((r) => r.categoryName.trim()))),
      resolveNames(brands, user.tenantId, new Set(rows.map((r) => r.brandName.trim()))),
      resolveNames(units, user.tenantId, new Set(rows.map((r) => r.unitName.trim()))),
    ])

    // Mã đã có để phân biệt "thêm mới" với "cập nhật" trong báo cáo
    const codes = rows.map((r) => r.code).filter(Boolean)
    const existingCodes = new Set(
      codes.length > 0
        ? (
            await db
              .select({ code: products.code })
              .from(products)
              .where(and(eq(products.tenantId, user.tenantId), inArray(products.code, codes)))
          ).map((r) => r.code)
        : [],
    )

    /*
     * Dòng thiếu mã thì tự sinh. Lấy số lớn nhất một lần rồi tăng dần trong bộ
     * nhớ — hỏi cơ sở dữ liệu cho từng dòng chính là thứ đã làm cụt request.
     */
    const needsCode = rows.filter((r) => !r.code)
    const nextByKind = new Map<string, number>()
    if (needsCode.length > 0) {
      const maxima = await db
        .select({ kind: products.kind, code: sql<string>`max(${products.code})` })
        .from(products)
        .where(eq(products.tenantId, user.tenantId))
        .groupBy(products.kind)

      for (const row of maxima) {
        const prefix = CODE_PREFIX[row.kind as keyof typeof CODE_PREFIX]
        const n = Number.parseInt((row.code ?? '').slice(prefix.length), 10)
        nextByKind.set(row.kind, Number.isFinite(n) ? n + 1 : 1)
      }
    }

    const prepared: PreparedRow[] = []

    for (const row of rows) {
      const categoryId = categoryMap.get(row.categoryName.trim().toLowerCase()) ?? null
      const brandId = brandMap.get(row.brandName.trim().toLowerCase()) ?? null
      const unitId = unitMap.get(row.unitName.trim().toLowerCase()) ?? null

      /*
       * Gói được ghi ở lượt này không kèm buổi: thành phần trỏ tới dịch vụ khác
       * bằng mã, mà mã đó có thể nằm ở dòng sau trong cùng tệp. Lượt 2 mới nối.
       */
      const parsed = productImportSchema.safeParse({
        kind: row.kind,
        name: row.name,
        code: row.code,
        categoryId: categoryId ?? '',
        brandId: brandId ?? '',
        unitId: unitId ?? '',
        basePrice: row.basePrice,
        cost: row.cost,
        description: row.description,
        isActive: row.isActive,
        allowsSale: row.allowsSale,
        ...(row.kind === 'service'
          ? { durationMinutes: row.durationMinutes || '60', materials: [] }
          : {}),
        ...(row.kind === 'card'
          ? { cardFaceValue: row.cardFaceValue || row.basePrice, cardBonusValue: row.cardBonusValue }
          : {}),
        ...(row.kind === 'card' || row.kind === 'package'
          ? { validityType: row.validityType, validityValue: row.validityValue }
          : {}),
        ...(row.kind === 'package' ? { components: [] } : {}),
        ...(row.kind === 'product'
          ? { trackInventory: true, minQuantity: row.minQuantity, maxQuantity: row.maxQuantity }
          : {}),
      })

      if (!parsed.success) {
        const issue = parsed.error.issues[0]
        outcomes.push({
          line: row.line,
          status: 'failed',
          name: row.name,
          message: `${issue.path.map(String).join('.') || 'dữ liệu'}: ${issue.message}`,
        })
        continue
      }

      const input = parsed.data
      let code = row.code
      if (!code) {
        const prefix = CODE_PREFIX[row.kind]
        const n = nextByKind.get(row.kind) ?? 1
        nextByKind.set(row.kind, n + 1)
        code = `${prefix}${String(n).padStart(4, '0')}`
      }

      prepared.push({
        row,
        values: {
          tenantId: user.tenantId,
          code,
          name: input.name,
          kind: row.kind,
          categoryId,
          brandId,
          unitId,
          basePrice: String(input.basePrice),
          description: input.description ?? null,
          isActive: input.isActive,
          allowsSale: input.allowsSale,
          cost: String('cost' in input ? (input.cost ?? 0) : 0),
          durationMinutes: row.kind === 'service' ? Number(row.durationMinutes || 60) : null,
          cardFaceValue: row.kind === 'card' ? String(row.cardFaceValue || row.basePrice) : null,
          cardBonusValue: row.kind === 'card' ? String(row.cardBonusValue || 0) : null,
          validityType:
            row.kind === 'card' || row.kind === 'package' ? row.validityType : 'unlimited',
          validityValue:
            (row.kind === 'card' || row.kind === 'package') && row.validityValue
              ? Number(row.validityValue)
              : null,
          trackInventory: row.kind === 'product',
          minQuantity: row.kind === 'product' && row.minQuantity ? row.minQuantity : null,
          maxQuantity: row.kind === 'product' && row.maxQuantity ? row.maxQuantity : null,
        },
      })
    }

    if (prepared.length > 0) {
      await upsertProducts(prepared.map((p) => p.values))

      for (const p of prepared) {
        outcomes.push({
          line: p.row.line,
          status: existingCodes.has(p.values.code as string) ? 'updated' : 'created',
          name: p.row.name,
        })
      }

      await writeAudit({
        tenantId: user.tenantId,
        userId: user.id,
        entity: 'product',
        entityId: user.tenantId,
        action: 'create',
        after: { imported: prepared.length },
        reason: `Nhập ${prepared.length} hàng hoá từ tệp`,
      })
      revalidatePath('/admin/products')
    }

    return { outcomes }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('[importProductsAction]', message)
    return { outcomes, error: 'Lô này ghi không thành công. Chi tiết đã được ghi lại.' }
  }
}

/** Một câu ghi cho cả lô; mã trùng thì cập nhật thay vì tạo bản sao. */
async function upsertProducts(values: Record<string, unknown>[]) {
  await db
    .insert(products)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .values(values as any)
    .onConflictDoUpdate({
      target: [products.tenantId, products.code],
      set: {
        name: sql`excluded.name`,
        kind: sql`excluded.kind`,
        categoryId: sql`excluded.category_id`,
        brandId: sql`excluded.brand_id`,
        unitId: sql`excluded.unit_id`,
        basePrice: sql`excluded.base_price`,
        cost: sql`excluded.cost`,
        description: sql`excluded.description`,
        isActive: sql`excluded.is_active`,
        allowsSale: sql`excluded.allows_sale`,
        durationMinutes: sql`excluded.duration_minutes`,
        cardFaceValue: sql`excluded.card_face_value`,
        cardBonusValue: sql`excluded.card_bonus_value`,
        validityType: sql`excluded.validity_type`,
        validityValue: sql`excluded.validity_value`,
        trackInventory: sql`excluded.track_inventory`,
        minQuantity: sql`excluded.min_quantity`,
        maxQuantity: sql`excluded.max_quantity`,
      },
    })
}

/**
 * **Lượt 2**: nối buổi của gói và định mức nguyên vật liệu của dịch vụ.
 *
 * Tách khỏi lượt 1 vì thành phần trỏ tới hàng hoá khác bằng mã, và mã đó có
 * thể nằm ở dòng phía sau trong cùng tệp. Chạy sau khi mọi dòng đã vào cơ sở
 * dữ liệu thì mọi tham chiếu đều phân giải được, bất kể thứ tự dòng.
 *
 * Cũng theo lô, cùng lý do với lượt 1: xoá cũ một câu, ghi mới một câu.
 */
export async function linkImportComponentsAction(rows: ImportRow[]): Promise<ImportBatchResult> {
  let user
  try {
    user = await assertPermission('product.manage')
  } catch (e) {
    if (e instanceof ForbiddenError) return { outcomes: [], error: 'Bạn không có quyền.' }
    throw e
  }

  if (rows.length > MAX_ROWS) return { outcomes: [], error: `Mỗi lô tối đa ${MAX_ROWS} dòng.` }
  if (rows.length === 0) return { outcomes: [] }

  const wanted = new Set<string>()
  for (const row of rows) {
    if (row.code) wanted.add(row.code)
    for (const c of row.components) wanted.add(c.code)
  }

  try {
    const known = await db
      .select({
        id: products.id,
        code: products.code,
        kind: products.kind,
        basePrice: products.basePrice,
      })
      .from(products)
      .where(and(eq(products.tenantId, user.tenantId), inArray(products.code, [...wanted])))

    const byCode = new Map(known.map((p) => [p.code, p]))
    const outcomes: ImportOutcome[] = []

    const packageRows: (typeof packageItems.$inferInsert)[] = []
    const materialRows: (typeof serviceMaterials.$inferInsert)[] = []
    const packageIds: string[] = []
    const serviceIds: string[] = []

    for (const row of rows) {
      const self = byCode.get(row.code)
      if (!self) {
        outcomes.push({
          line: row.line,
          status: 'failed',
          name: row.name,
          message: 'Không tìm thấy hàng hoá vừa nhập để nối thành phần',
        })
        continue
      }

      if (row.kind === 'package') {
        const parts = row.components
          .map((c) => ({ ref: c, target: byCode.get(c.code) }))
          .filter((p) => p.target?.kind === 'service')

        if (parts.length === 0) {
          outcomes.push({
            line: row.line,
            status: 'failed',
            name: row.name,
            message: `Không tìm thấy dịch vụ ${row.components.map((c) => c.code).join(', ')} trong danh mục`,
          })
          continue
        }

        packageIds.push(self.id)
        parts.forEach((p, i) =>
          packageRows.push({
            packageId: self.id,
            serviceId: p.target!.id,
            sessions: Math.max(1, Math.round(p.ref.quantity)),
            bonusSessions: 0,
            // Giá lẻ lấy từ chính dịch vụ đó — cơ sở để phân bổ giá trị gói
            // theo tỷ trọng (ADR-001 §1.3).
            retailPrice: p.target!.basePrice,
            sortOrder: i,
          }),
        )
        outcomes.push({
          line: row.line,
          status: 'updated',
          name: row.name,
          message: `${parts.length} dịch vụ trong gói`,
        })
        continue
      }

      // Dịch vụ: định mức chỉ nhận hàng hoá vật lý
      const materials = row.components
        .map((c) => ({ ref: c, target: byCode.get(c.code) }))
        .filter((m) => m.target?.kind === 'product')

      serviceIds.push(self.id)
      for (const m of materials) {
        materialRows.push({
          serviceId: self.id,
          materialId: m.target!.id,
          quantity: String(m.ref.quantity),
        })
      }

      const missing = row.components.length - materials.length
      outcomes.push({
        line: row.line,
        status: 'updated',
        name: row.name,
        message:
          missing > 0
            ? `${materials.length} định mức, bỏ qua ${missing} mã không phải sản phẩm`
            : `${materials.length} định mức`,
      })
    }

    // Ghi đè trọn vẹn: xoá cũ rồi ghi mới, mỗi thứ đúng một câu lệnh
    if (packageIds.length > 0) {
      await db.delete(packageItems).where(inArray(packageItems.packageId, packageIds))
      if (packageRows.length > 0) await db.insert(packageItems).values(packageRows)
    }
    if (serviceIds.length > 0) {
      await db.delete(serviceMaterials).where(inArray(serviceMaterials.serviceId, serviceIds))
      if (materialRows.length > 0) await db.insert(serviceMaterials).values(materialRows)
    }

    revalidatePath('/admin/products')
    return { outcomes }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('[linkImportComponentsAction]', message)
    return { outcomes: [], error: 'Không nối được thành phần. Chi tiết đã được ghi lại.' }
  }
}
