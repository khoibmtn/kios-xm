import { asc, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { brands, categories, products, units } from '@/lib/schema'

/**
 * Dữ liệu cho màn hình quản lý nhóm hàng / thương hiệu / đơn vị tính.
 *
 * Ở module thường chứ không phải `actions.ts`: mọi export của file `'use
 * server'` đều thành điểm gọi được từ trình duyệt, mà hàm này nhận `tenantId`
 * và không tự kiểm tra quyền (xem `AGENTS.md` §3c).
 */

export interface CatalogRow {
  id: string
  name: string
  isActive: boolean
  /** Số hàng hoá đang trỏ tới mục này — để cảnh báo trước khi xoá. */
  usage: number
}

export interface CategoryRow extends CatalogRow {
  parentId: string | null
  path: string
  /** Độ sâu trong cây, dùng để thụt lề khi hiển thị. */
  depth: number
}

export async function loadCatalogUnits(tenantId: string) {
  const [categoryRows, brandRows, unitRows, usage] = await Promise.all([
    db
      .select({
        id: categories.id,
        name: categories.name,
        parentId: categories.parentId,
        path: categories.path,
        isActive: categories.isActive,
        sortOrder: categories.sortOrder,
      })
      .from(categories)
      .where(eq(categories.tenantId, tenantId))
      .orderBy(asc(categories.sortOrder), asc(categories.name)),

    db
      .select({ id: brands.id, name: brands.name, isActive: brands.isActive })
      .from(brands)
      .where(eq(brands.tenantId, tenantId))
      .orderBy(asc(brands.name)),

    db
      .select({ id: units.id, name: units.name, isActive: units.isActive })
      .from(units)
      .where(eq(units.tenantId, tenantId))
      .orderBy(asc(units.name)),

    countUsage(tenantId),
  ])

  /*
   * Xếp cây bằng cách duyệt từ gốc xuống, không sắp theo `path` dạng chuỗi:
   * `path` chứa id ngẫu nhiên nên sắp theo nó sẽ ra thứ tự vô nghĩa với người
   * đọc. Duyệt từ gốc cho phép giữ đúng thứ tự tên trong từng cấp.
   */
  const byParent = new Map<string | null, typeof categoryRows>()
  for (const row of categoryRows) {
    const key = row.parentId
    if (!byParent.has(key)) byParent.set(key, [])
    byParent.get(key)!.push(row)
  }

  const tree: CategoryRow[] = []
  const walk = (parentId: string | null, depth: number) => {
    for (const row of byParent.get(parentId) ?? []) {
      tree.push({
        id: row.id,
        name: row.name,
        parentId: row.parentId,
        path: row.path,
        isActive: row.isActive,
        depth,
        usage: usage.category[row.id] ?? 0,
      })
      walk(row.id, depth + 1)
    }
  }
  walk(null, 0)

  return {
    categories: tree,
    brands: brandRows.map((r) => ({ ...r, usage: usage.brand[r.id] ?? 0 })),
    units: unitRows.map((r) => ({ ...r, usage: usage.unit[r.id] ?? 0 })),
  }
}

async function countUsage(tenantId: string) {
  const column = { category: products.categoryId, brand: products.brandId, unit: products.unitId }

  const entries = await Promise.all(
    (Object.keys(column) as (keyof typeof column)[]).map(async (key) => {
      const rows = await db
        .select({ id: column[key], n: sql<number>`count(*)::int` })
        .from(products)
        .where(eq(products.tenantId, tenantId))
        .groupBy(column[key])
      return [
        key,
        Object.fromEntries(rows.filter((r) => r.id).map((r) => [r.id as string, r.n])),
      ] as const
    }),
  )

  return Object.fromEntries(entries) as Record<'category' | 'brand' | 'unit', Record<string, number>>
}
