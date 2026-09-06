'use server'

import { revalidatePath } from 'next/cache'
import { and, eq, like, ne, sql } from 'drizzle-orm'
import { z } from 'zod'
import { assertPermission, ForbiddenError } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { brands, categories, products, units } from '@/lib/schema'

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

/**
 * `path` là chuỗi id tổ tiên kể cả chính nó: `/goc/con/chau/`.
 *
 * Giữ sẵn như vậy để hỏi "mọi nhánh dưới X" chỉ là một câu `LIKE X.path || '%'`
 * thay vì đệ quy — nhóm hàng của spa nông nhưng câu truy vấn này sẽ nằm trong
 * đường đi của mọi màn hình lọc hàng hoá.
 */
function pathOf(parentPath: string | null, id: string): string {
  return `${parentPath ?? '/'}${id}/`
}

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

    // ── Nhóm hàng: có cây, nên phải lo cả đường dẫn lẫn vòng lặp ──
    const parent = parentId && parentId !== '' ? parentId : null
    if (parent && !idSchema.safeParse(parent).success) {
      return { ok: false, error: 'Nhóm cha không hợp lệ.' }
    }

    let parentPath: string | null = null
    if (parent) {
      const [row] = await db
        .select({ path: categories.path })
        .from(categories)
        .where(and(eq(categories.id, parent), eq(categories.tenantId, user.tenantId)))
        .limit(1)
      if (!row) return { ok: false, error: 'Không tìm thấy nhóm cha.' }
      parentPath = row.path
    }

    if (!id) {
      const [created] = await db
        .insert(categories)
        .values({ tenantId: user.tenantId, name, parentId: parent })
        .returning({ id: categories.id })
      await db
        .update(categories)
        .set({ path: pathOf(parentPath, created.id) })
        .where(eq(categories.id, created.id))
      revalidatePath('/admin/catalog')
      revalidatePath('/admin/products')
      return { ok: true }
    }

    const [current] = await db
      .select({ path: categories.path })
      .from(categories)
      .where(and(eq(categories.id, id), eq(categories.tenantId, user.tenantId)))
      .limit(1)
    if (!current) return { ok: false, error: 'Không tìm thấy nhóm hàng.' }

    /*
     * Chuyển một nhóm vào chính nhánh con của nó sẽ cắt rời cả nhánh khỏi cây:
     * không còn đường về gốc, nhóm biến mất khỏi mọi màn hình mà dữ liệu vẫn
     * nằm đó. `path` cho phép chặn bằng đúng một phép so chuỗi.
     */
    if (parent && (parent === id || parentPath?.startsWith(current.path))) {
      return { ok: false, error: 'Không thể chuyển một nhóm vào chính nhánh con của nó.' }
    }

    const newPath = pathOf(parentPath, id)

    await db.transaction(async (tx) => {
      await tx.update(categories).set({ name, parentId: parent, path: newPath }).where(eq(categories.id, id))

      // Cả nhánh con phải đổi theo, nếu không đường dẫn sẽ trỏ về nơi cũ
      if (newPath !== current.path) {
        await tx
          .update(categories)
          .set({
            path: sql`${newPath} || substring(${categories.path} from ${current.path.length + 1})`,
          })
          .where(
            and(
              eq(categories.tenantId, user.tenantId),
              ne(categories.id, id),
              like(categories.path, `${current.path}%`),
            ),
          )
      }
    })

    revalidatePath('/admin/catalog')
    revalidatePath('/admin/products')
    return { ok: true }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    if (message.includes(UNIQUE_KEY[kind])) {
      return { ok: false, error: `${LABEL[kind]} tên này đã có rồi.` }
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

