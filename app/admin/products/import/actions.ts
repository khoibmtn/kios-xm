'use server'

import { revalidatePath } from 'next/cache'
import { and, eq } from 'drizzle-orm'
import { assertPermission, ForbiddenError } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { brands, categories, products, units } from '@/lib/schema'
import { writeAudit } from '@/lib/audit'
import { productSchema } from '@/lib/catalog/product-schema'
import { nextProductCode } from '@/lib/catalog/next-code'
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

/** Tìm theo tên, chưa có thì tạo. Trả id để gắn vào hàng hoá. */
async function resolveByName(
  table: typeof categories | typeof brands | typeof units,
  tenantId: string,
  name: string,
  cache: Map<string, string>,
): Promise<string | null> {
  const clean = name.trim()
  if (!clean) return null

  const cacheKey = `${table === categories ? 'c' : table === brands ? 'b' : 'u'}:${clean.toLowerCase()}`
  const cached = cache.get(cacheKey)
  if (cached) return cached

  const [existing] = await db
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.tenantId, tenantId), eq(table.name, clean)))
    .limit(1)

  if (existing) {
    cache.set(cacheKey, existing.id)
    return existing.id
  }

  const [created] = await db
    .insert(table)
    .values({ tenantId, name: clean })
    .returning({ id: table.id })
  cache.set(cacheKey, created.id)
  return created.id
}

/**
 * Ghi một lô hàng hoá từ tệp nhập.
 *
 * Từng dòng một chứ không một câu lệnh gộp: mục đích của màn hình nhập là *báo
 * cáo được dòng nào hỏng vì sao*, mà một câu `INSERT` nhiều dòng thì chỉ cần
 * một dòng sai là hỏng cả lô và người dùng không biết dòng nào. Chậm hơn,
 * nhưng nhập danh mục là việc làm một lần lúc chuyển phần mềm.
 *
 * Nhóm hàng, thương hiệu và đơn vị tính chưa có thì **tạo luôn theo tên** —
 * đúng thứ đang cần khi mang 196 dòng từ phần mềm cũ sang.
 */
export async function importProductsAction(rows: ImportRow[]): Promise<ImportBatchResult> {
  let user
  try {
    user = await assertPermission('product.manage')
  } catch (e) {
    if (e instanceof ForbiddenError) return { outcomes: [], error: 'Bạn không có quyền.' }
    throw e
  }

  if (rows.length > 100) {
    return { outcomes: [], error: 'Mỗi lô tối đa 100 dòng.' }
  }

  const outcomes: ImportOutcome[] = []
  const cache = new Map<string, string>()

  for (const row of rows) {
    try {
      /*
       * Gói liệu trình không nhập được từ tệp phẳng: nó cần danh sách dịch vụ
       * con kèm số buổi và giá lẻ, tức là một bảng con — không có cách nào
       * biểu diễn trung thực trên một dòng CSV. Nói thẳng thay vì tạo ra một
       * cái gói rỗng rồi để chủ spa tự phát hiện sau.
       */
      if (row.kind === 'package') {
        outcomes.push({
          line: row.line,
          status: 'failed',
          name: row.name,
          message: 'Gói liệu trình phải tạo bằng form vì cần khai danh sách buổi',
        })
        continue
      }

      const [categoryId, brandId, unitId] = await Promise.all([
        resolveByName(categories, user.tenantId, row.categoryName, cache),
        resolveByName(brands, user.tenantId, row.brandName, cache),
        resolveByName(units, user.tenantId, row.unitName, cache),
      ])

      const parsed = productSchema.safeParse({
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
        allowsSale: true,
        ...(row.kind === 'service' ? { durationMinutes: row.durationMinutes || '60', materials: [] } : {}),
        ...(row.kind === 'card'
          ? {
              cardFaceValue: row.cardFaceValue || row.basePrice,
              cardBonusValue: row.cardBonusValue,
              validityType: 'unlimited',
            }
          : {}),
        ...(row.kind === 'product'
          ? { trackInventory: true, minQuantity: row.minQuantity, maxQuantity: '' }
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
      const base = {
        tenantId: user.tenantId,
        name: input.name,
        kind: input.kind,
        categoryId: categoryId,
        brandId: brandId,
        unitId: unitId,
        basePrice: String(input.basePrice),
        description: input.description ?? null,
        isActive: input.isActive,
        allowsSale: input.allowsSale,
        cost: String('cost' in input ? (input.cost ?? 0) : 0),
        durationMinutes: input.kind === 'service' ? input.durationMinutes : null,
        cardFaceValue: input.kind === 'card' ? String(input.cardFaceValue) : null,
        cardBonusValue: input.kind === 'card' ? String(input.cardBonusValue ?? 0) : null,
        trackInventory: input.kind === 'product' ? input.trackInventory : false,
        minQuantity:
          input.kind === 'product' && input.minQuantity != null ? String(input.minQuantity) : null,
      }

      // Có mã và mã đã tồn tại thì coi là cập nhật — nhập lại tệp đã sửa
      // không được sinh ra bản sao.
      const existing = row.code
        ? await db
            .select({ id: products.id })
            .from(products)
            .where(and(eq(products.tenantId, user.tenantId), eq(products.code, row.code)))
            .limit(1)
        : []

      if (existing.length > 0) {
        await db.update(products).set(base).where(eq(products.id, existing[0].id))
        outcomes.push({ line: row.line, status: 'updated', name: row.name })
      } else {
        const code = row.code || (await nextProductCode(user.tenantId, input.kind))
        await db.insert(products).values({ ...base, code })
        outcomes.push({ line: row.line, status: 'created', name: row.name })
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      console.error('[importProductsAction]', row.line, message)
      outcomes.push({
        line: row.line,
        status: 'failed',
        name: row.name,
        message: message.includes('products_tenant_code_key')
          ? 'Mã hàng đã tồn tại'
          : 'Không ghi được dòng này',
      })
    }
  }

  const written = outcomes.filter((o) => o.status !== 'failed').length
  if (written > 0) {
    await writeAudit({
      tenantId: user.tenantId,
      userId: user.id,
      entity: 'product',
      entityId: user.tenantId,
      action: 'create',
      after: { imported: written },
      reason: `Nhập ${written} hàng hoá từ tệp`,
    })
    revalidatePath('/admin/products')
  }

  return { outcomes }
}
