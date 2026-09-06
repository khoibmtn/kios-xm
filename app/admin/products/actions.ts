'use server'

import { revalidatePath } from 'next/cache'
import { and, eq } from 'drizzle-orm'
import { assertPermission, ForbiddenError } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { packageItems, products, serviceMaterials } from '@/lib/schema'
import { writeAudit, diffFields } from '@/lib/audit'
import { productSchema, type ProductInput } from '@/lib/catalog/product-schema'
import { nextProductCode } from '@/lib/catalog/next-code'

export interface ActionState {
  error?: string
  /** Lỗi theo từng trường, khoá là đường dẫn zod nối bằng dấu chấm. */
  fieldErrors?: Record<string, string>
  savedId?: string
}

function collectErrors(error: { issues: { path: PropertyKey[]; message: string }[] }) {
  const fieldErrors: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = issue.path.map(String).join('.')
    fieldErrors[key] ??= issue.message
  }
  return fieldErrors
}

/** Chỉ giữ những cột thuộc về loại đang lưu — tránh sót giá trị của loại cũ. */
function toRow(input: ProductInput, tenantId: string, code: string) {
  const base = {
    tenantId,
    code,
    name: input.name,
    kind: input.kind,
    categoryId: input.categoryId ?? null,
    brandId: input.brandId ?? null,
    unitId: input.unitId ?? null,
    basePrice: String(input.basePrice),
    description: input.description ?? null,
    isActive: input.isActive,
    allowsSale: input.allowsSale,
    // Đặt lại toàn bộ trường riêng của loại khác về null, phòng khi đổi loại
    durationMinutes: null as number | null,
    cardFaceValue: null as string | null,
    cardBonusValue: null as string | null,
    validityType: 'unlimited' as ProductInput extends { validityType: infer V } ? V : never,
    validityValue: null as number | null,
    trackInventory: false,
    minQuantity: null as string | null,
    maxQuantity: null as string | null,
    cost: '0',
  }

  switch (input.kind) {
    case 'product':
      return {
        ...base,
        cost: String(input.cost ?? 0),
        trackInventory: input.trackInventory,
        minQuantity: input.minQuantity != null ? String(input.minQuantity) : null,
        maxQuantity: input.maxQuantity != null ? String(input.maxQuantity) : null,
      }
    case 'service':
      return {
        ...base,
        cost: String(input.cost ?? 0),
        durationMinutes: input.durationMinutes,
      }
    case 'package':
      return {
        ...base,
        validityType: input.validityType,
        validityValue: input.validityValue ?? null,
      }
    case 'card':
      return {
        ...base,
        validityType: input.validityType,
        validityValue: input.validityValue ?? null,
        cardFaceValue: String(input.cardFaceValue),
        cardBonusValue: String(input.cardBonusValue ?? 0),
      }
  }
}

export async function saveProductAction(
  productId: string | null,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let user
  try {
    user = await assertPermission('product.manage')
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: 'Bạn không có quyền sửa hàng hoá.' }
    throw e
  }

  // Các danh sách lồng nhau được gửi dưới dạng JSON để không phải tự tháo
  // cú pháp "components[0][sessions]" của FormData.
  const raw: Record<string, unknown> = Object.fromEntries(formData)
  for (const key of ['components', 'materials']) {
    if (typeof raw[key] === 'string') {
      try {
        raw[key] = JSON.parse(raw[key] as string)
      } catch {
        raw[key] = []
      }
    }
  }
  raw.isActive = formData.get('isActive') === 'on' || formData.get('isActive') === 'true'
  raw.allowsSale = formData.get('allowsSale') === 'on' || formData.get('allowsSale') === 'true'
  if (raw.kind === 'product') {
    raw.trackInventory =
      formData.get('trackInventory') === 'on' || formData.get('trackInventory') === 'true'
  }

  const parsed = productSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      error: 'Vui lòng kiểm tra lại các ô được đánh dấu.',
      fieldErrors: collectErrors(parsed.error),
    }
  }
  const input = parsed.data

  try {
    const savedId = await db.transaction(async (tx) => {
      let id = productId
      let before: Record<string, unknown> | null = null

      if (id) {
        const [existing] = await tx
          .select()
          .from(products)
          .where(and(eq(products.id, id), eq(products.tenantId, user.tenantId)))
          .limit(1)
        if (!existing) throw new Error('Không tìm thấy hàng hoá')
        before = existing as unknown as Record<string, unknown>

        const row = toRow(input, user.tenantId, input.code?.trim() || existing.code)
        await tx.update(products).set(row).where(eq(products.id, id))
      } else {
        const code = input.code?.trim() || (await nextProductCode(user.tenantId, input.kind, tx))
        const [created] = await tx
          .insert(products)
          .values(toRow(input, user.tenantId, code))
          .returning({ id: products.id })
        id = created.id
      }

      // Thành phần gói: ghi đè toàn bộ, đơn giản và không để sót dòng cũ
      if (input.kind === 'package') {
        await tx.delete(packageItems).where(eq(packageItems.packageId, id))
        await tx.insert(packageItems).values(
          input.components.map((c, i) => ({
            packageId: id!,
            serviceId: c.serviceId,
            sessions: c.sessions,
            bonusSessions: c.bonusSessions,
            retailPrice: String(c.retailPrice),
            sortOrder: i,
          })),
        )
      }

      if (input.kind === 'service') {
        await tx.delete(serviceMaterials).where(eq(serviceMaterials.serviceId, id))
        if (input.materials.length > 0) {
          await tx.insert(serviceMaterials).values(
            input.materials.map((m) => ({
              serviceId: id!,
              materialId: m.materialId,
              quantity: String(m.quantity),
            })),
          )
        }
      }

      // Giá là dữ liệu tiền — mọi thay đổi phải truy được (AGENTS.md §3b)
      await writeAudit(
        {
          tenantId: user.tenantId,
          userId: user.id,
          entity: 'product',
          entityId: id,
          action: productId ? 'update' : 'create',
          ...(before
            ? diffFields(before, {
                name: input.name,
                basePrice: String(input.basePrice),
                isActive: input.isActive,
              })
            : { after: { name: input.name, kind: input.kind, basePrice: input.basePrice } }),
        },
        tx,
      )

      return id
    })

    revalidatePath('/admin/products')
    revalidatePath(`/admin/products/${savedId}`)
    return { savedId }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    // Ràng buộc UNIQUE của cơ sở dữ liệu là nơi bắt trùng mã cuối cùng
    if (message.includes('products_tenant_code_key')) {
      return { error: 'Mã hàng này đã tồn tại.', fieldErrors: { code: 'Mã đã được dùng' } }
    }
    // Lỗi gốc của Drizzle mang theo cả câu lệnh và tham số — không phải thứ để
    // in lên màn hình. Chi tiết vào nhật ký Worker, người dùng nhận câu đọc được.
    console.error('[saveProductAction]', message)
    return { error: 'Không lưu được. Vui lòng thử lại — lỗi đã được ghi lại để kiểm tra.' }
  }
}

export async function toggleProductActiveAction(
  productId: string,
  isActive: boolean,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const user = await assertPermission('product.manage')

    await db.transaction(async (tx) => {
      await tx
        .update(products)
        .set({ isActive })
        .where(and(eq(products.id, productId), eq(products.tenantId, user.tenantId)))

      await writeAudit(
        {
          tenantId: user.tenantId,
          userId: user.id,
          entity: 'product',
          entityId: productId,
          action: 'update',
          after: { isActive },
          reason: isActive ? 'Mở bán lại' : 'Ngừng bán',
        },
        tx,
      )
    })

    revalidatePath('/admin/products')
    return { ok: true }
  } catch (e) {
    if (e instanceof ForbiddenError) return { ok: false, error: 'Bạn không có quyền.' }
    return { ok: false, error: e instanceof Error ? e.message : 'Lỗi không xác định' }
  }
}

/** Gợi ý mã tiếp theo cho giao diện, không ràng buộc gì. */
export async function suggestCodeAction(kind: ProductInput['kind']): Promise<string> {
  const user = await assertPermission('product.view')
  return nextProductCode(user.tenantId, kind)
}
