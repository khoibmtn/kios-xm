'use server'

import { revalidatePath } from 'next/cache'
import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { assertPermission, ForbiddenError } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { brands, categories, units } from '@/lib/schema'

export type CatalogKind = 'category' | 'brand' | 'unit'

export interface CatalogActionResult {
  ok: boolean
  error?: string
}

const nameSchema = z.string('Chưa nhập tên').trim().min(1, 'Chưa nhập tên').max(100, 'Tên tối đa 100 ký tự')
const idSchema = z.uuid('Giá trị không hợp lệ')

const LABEL: Record<CatalogKind, string> = {
  category: 'Nhóm hàng',
  brand: 'Thương hiệu',
  unit: 'Đơn vị tính',
}

/** Ràng buộc UNIQUE tương ứng, để dịch lỗi cơ sở dữ liệu thành câu tiếng Việt. */
const UNIQUE_KEY: Record<CatalogKind, string> = {
  category: 'categories_tenant_parent_name_key',
  brand: 'brands_tenant_name_key',
  unit: 'units_tenant_name_key',
}

/*
 * `categories.path` là chuỗi id tổ tiên kể cả chính nó: `/goc/con/chau/`, giữ
 * sẵn để hỏi "mọi nhánh dưới X" chỉ tốn một câu `LIKE X.path || '%'`.
 *
 * Cột này do **trigger trong cơ sở dữ liệu** tính, không phải mã ở đây — xem
 * `drizzle/0007_category_path_trigger.sql`. Trước đó nó được ghi ở tầng ứng
 * dụng, và kịch bản seed lại hiểu nó là "đường dẫn tên nhóm" rồi ghi tên vào;
 * hai cách hiểu cùng tồn tại êm đẹp cho tới khi có nhóm con thật thì phép kiểm
 * tra vòng lặp lặng lẽ vô hiệu. Giá trị suy ra được thì để nơi duy nhất suy ra.
 */

export async function saveCatalogItemAction(
  kind: CatalogKind,
  id: string | null,
  rawName: string,
  parentId?: string | null,
): Promise<CatalogActionResult> {
  let user
  try {
    user = await assertPermission('product.manage')
  } catch (e) {
    if (e instanceof ForbiddenError) return { ok: false, error: 'Bạn không có quyền.' }
    throw e
  }

  const parsedName = nameSchema.safeParse(rawName)
  if (!parsedName.success) return { ok: false, error: parsedName.error.issues[0].message }
  const name = parsedName.data

  try {
    if (kind === 'brand' || kind === 'unit') {
      const table = kind === 'brand' ? brands : units
      if (id) {
        await db
          .update(table)
          .set({ name })
          .where(and(eq(table.id, id), eq(table.tenantId, user.tenantId)))
      } else {
        await db.insert(table).values({ tenantId: user.tenantId, name })
      }
      revalidatePath('/admin/catalog')
      return { ok: true }
    }

    // ── Nhóm hàng: có cây ──
    const parent = parentId && parentId !== '' ? parentId : null
    if (parent && !idSchema.safeParse(parent).success) {
      return { ok: false, error: 'Nhóm cha không hợp lệ.' }
    }

    if (!id) {
      await db.insert(categories).values({ tenantId: user.tenantId, name, parentId: parent })
      revalidatePath('/admin/catalog')
      revalidatePath('/admin/products')
      return { ok: true }
    }

    /*
     * Chặn vòng lặp ở đây chỉ để có câu tiếng Việt tử tế; trigger trong cơ sở
     * dữ liệu mới là thứ bảo đảm, và nó phủ cả những đường ghi không đi qua
     * màn hình này.
     */
    if (parent) {
      const [parentRow] = await db
        .select({ path: categories.path })
        .from(categories)
        .where(and(eq(categories.id, parent), eq(categories.tenantId, user.tenantId)))
        .limit(1)
      if (!parentRow) return { ok: false, error: 'Không tìm thấy nhóm cha.' }

      if (parent === id || parentRow.path.includes(`/${id}/`)) {
        return { ok: false, error: 'Không thể chuyển một nhóm vào chính nhánh con của nó.' }
      }
    }

    await db
      .update(categories)
      .set({ name, parentId: parent })
      .where(and(eq(categories.id, id), eq(categories.tenantId, user.tenantId)))

    revalidatePath('/admin/catalog')
    revalidatePath('/admin/products')
    return { ok: true }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    if (message.includes(UNIQUE_KEY[kind])) {
      return { ok: false, error: `${LABEL[kind]} tên này đã có rồi.` }
    }
    if (message.includes('nhánh con của nó')) {
      return { ok: false, error: 'Không thể chuyển một nhóm vào chính nhánh con của nó.' }
    }
    console.error('[saveCatalogItemAction]', message)
    return { ok: false, error: 'Không lưu được. Vui lòng thử lại.' }
  }
}

export async function deleteCatalogItemAction(
  kind: CatalogKind,
  id: string,
): Promise<CatalogActionResult> {
  let user
  try {
    user = await assertPermission('product.manage')
  } catch (e) {
    if (e instanceof ForbiddenError) return { ok: false, error: 'Bạn không có quyền.' }
    throw e
  }

  if (!idSchema.safeParse(id).success) return { ok: false, error: 'Giá trị không hợp lệ.' }

  try {
    if (kind === 'category') {
      /*
       * Khoá ngoại `parent_id` khai ON DELETE CASCADE, nên xoá một nhóm cha sẽ
       * lặng lẽ xoá sạch cả nhánh dưới. Chặn ở đây và bắt người dùng dọn nhánh
       * con trước — mất cả cây vì một cú bấm là thứ không hoàn tác được.
       */
      const [{ n }] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(categories)
        .where(and(eq(categories.tenantId, user.tenantId), eq(categories.parentId, id)))
      if (n > 0) {
        return {
          ok: false,
          error: `Nhóm này còn ${n} nhóm con. Hãy chuyển hoặc xoá nhóm con trước.`,
        }
      }
    }

    const table = kind === 'category' ? categories : kind === 'brand' ? brands : units
    await db.delete(table).where(and(eq(table.id, id), eq(table.tenantId, user.tenantId)))

    revalidatePath('/admin/catalog')
    revalidatePath('/admin/products')
    return { ok: true }
  } catch (e) {
    console.error('[deleteCatalogItemAction]', e instanceof Error ? e.message : e)
    return { ok: false, error: 'Không xoá được. Vui lòng thử lại.' }
  }
}

/** Bật/tắt "đang dùng" — nhẹ tay hơn xoá khi danh mục đã dính vào lịch sử. */
export async function toggleCatalogItemAction(
  kind: CatalogKind,
  id: string,
  isActive: boolean,
): Promise<CatalogActionResult> {
  try {
    const user = await assertPermission('product.manage')
    const table = kind === 'category' ? categories : kind === 'brand' ? brands : units
    await db
      .update(table)
      .set({ isActive })
      .where(and(eq(table.id, id), eq(table.tenantId, user.tenantId)))
    revalidatePath('/admin/catalog')
    revalidatePath('/admin/products')
    return { ok: true }
  } catch (e) {
    if (e instanceof ForbiddenError) return { ok: false, error: 'Bạn không có quyền.' }
    console.error('[toggleCatalogItemAction]', e instanceof Error ? e.message : e)
    return { ok: false, error: 'Không đổi được trạng thái.' }
  }
}

