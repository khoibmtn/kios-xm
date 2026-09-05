import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local', override: true })

import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { eq } from 'drizzle-orm'
import * as s from '../lib/schema'

/**
 * Dữ liệu danh mục mẫu.
 *
 * Lấy theo đúng hàng hoá thật quan sát được trong tài khoản KiotViet Salon
 * (`docs/research/01-module-map.md` §5) để màn hình danh sách và các phép tính
 * về sau chạy trên dữ liệu giống thực tế, không phải "Sản phẩm A / Dịch vụ B".
 */
const pool = new Pool({ connectionString: process.env.DIRECT_URL })
const db = drizzle(pool, { casing: 'snake_case' })

async function main() {
  const [tenant] = await db.select().from(s.tenants).limit(1)
  console.log(`Spa: ${tenant.name}\n`)

  // ── Nhóm hàng ──
  const categoryNames = [
    'Chăm sóc da',
    'Thay da sinh học',
    'Hoạt chất Meso',
    'Xoá nhăn',
    'VTYT bơm, kim',
    'Mỹ phẩm bán lẻ',
    'Gói liệu trình',
    'Thẻ tài khoản',
  ]
  const categories: Record<string, string> = {}
  for (const [i, name] of categoryNames.entries()) {
    const [row] = await db
      .insert(s.categories)
      .values({ tenantId: tenant.id, name, path: name, sortOrder: i })
      .onConflictDoUpdate({
        target: [s.categories.tenantId, s.categories.parentId, s.categories.name],
        set: { sortOrder: i },
      })
      .returning()
    categories[name] = row.id
  }
  console.log(`✓ ${categoryNames.length} nhóm hàng`)

  // ── Đơn vị tính ──
  const unitNames = ['Buổi', 'Lần', 'Chai', 'Lọ', 'Hộp', 'Tuýp', 'Miếng', 'Gói', 'Thẻ']
  const units: Record<string, string> = {}
  for (const name of unitNames) {
    const [row] = await db
      .insert(s.units)
      .values({ tenantId: tenant.id, name })
      .onConflictDoUpdate({ target: [s.units.tenantId, s.units.name], set: { isActive: true } })
      .returning()
    units[name] = row.id
  }
  console.log(`✓ ${unitNames.length} đơn vị tính`)

  // ── Thương hiệu ──
  const brandNames = ['Ahohwha', 'SVR', 'Usolab', 'Christina', 'JM', 'Lux PSM']
  const brands: Record<string, string> = {}
  for (const name of brandNames) {
    const [row] = await db
      .insert(s.brands)
      .values({ tenantId: tenant.id, name })
      .onConflictDoUpdate({ target: [s.brands.tenantId, s.brands.name], set: { isActive: true } })
      .returning()
    brands[name] = row.id
  }
  console.log(`✓ ${brandNames.length} thương hiệu`)

  // ── Hàng hoá ──
  type Row = typeof s.products.$inferInsert
  const items: Row[] = [
    // Dịch vụ — có thời lượng
    {
      tenantId: tenant.id, code: 'DV0001', kind: 'service',
      name: 'Phục hồi chuyên sâu đa tầng Nano Needle sau thay da sinh học (Buổi)',
      categoryId: categories['Chăm sóc da'], unitId: units['Buổi'],
      basePrice: '500000', cost: '78270', durationMinutes: 90,
    },
    {
      tenantId: tenant.id, code: 'DV0002', kind: 'service',
      name: 'Meso Glutanex Glow - Peel căng bóng trắng sáng (Buổi)',
      categoryId: categories['Hoạt chất Meso'], unitId: units['Buổi'],
      basePrice: '2000000', cost: '664950', durationMinutes: 90,
    },
    {
      tenantId: tenant.id, code: 'DV0003', kind: 'service',
      name: 'Thay da sinh học vùng mặt và cổ',
      categoryId: categories['Thay da sinh học'], unitId: units['Buổi'],
      basePrice: '2000000', cost: '520000', durationMinutes: 90,
    },
    {
      tenantId: tenant.id, code: 'DV0004', kind: 'service',
      name: 'Chăm sóc da mụn tối ưu giảm thâm ngừa sẹo (Buổi)',
      categoryId: categories['Chăm sóc da'], unitId: units['Buổi'],
      basePrice: '350000', cost: '95000', durationMinutes: 120,
    },
    {
      tenantId: tenant.id, code: 'DV0005', kind: 'service',
      name: 'Xoá mờ hôi nách (Lần)',
      categoryId: categories['VTYT bơm, kim'], unitId: units['Lần'],
      basePrice: '3000000', cost: '850000', durationMinutes: 60,
    },

    // Sản phẩm — có tồn kho
    {
      tenantId: tenant.id, code: 'SP0001', kind: 'product',
      name: 'Exclusive Cosmetic Body Scrub Quế hồi cà phê',
      categoryId: categories['Mỹ phẩm bán lẻ'], unitId: units['Hộp'],
      basePrice: '120000', cost: '60000', trackInventory: true, minQuantity: '5',
    },
    {
      tenantId: tenant.id, code: 'SP0002', kind: 'product',
      name: 'Ahohwha Vitamin K Cream Fullsize 50g (Tuýp)',
      categoryId: categories['Mỹ phẩm bán lẻ'], brandId: brands['Ahohwha'], unitId: units['Tuýp'],
      basePrice: '850000', cost: '476000', trackInventory: true, minQuantity: '3',
    },
    {
      tenantId: tenant.id, code: 'SP0003', kind: 'product',
      name: 'SVR Cleanser Gel Lavant 1000ml (Chai)',
      categoryId: categories['Mỹ phẩm bán lẻ'], brandId: brands['SVR'], unitId: units['Chai'],
      basePrice: '1050000', cost: '335000', trackInventory: true, minQuantity: '2',
    },
    {
      tenantId: tenant.id, code: 'SP0004', kind: 'product',
      name: 'Lux PSM Collagen Mask (miếng)',
      categoryId: categories['Mỹ phẩm bán lẻ'], brandId: brands['Lux PSM'], unitId: units['Miếng'],
      basePrice: '80000', cost: '38000', trackInventory: true, minQuantity: '20',
    },
    {
      tenantId: tenant.id, code: 'SP0005', kind: 'product',
      name: 'Usolab Bio Britening xịt khoáng 150ml (Lọ)',
      categoryId: categories['Mỹ phẩm bán lẻ'], brandId: brands['Usolab'], unitId: units['Lọ'],
      basePrice: '800000', cost: '380000', trackInventory: true, minQuantity: '3',
    },

    // Gói liệu trình
    {
      tenantId: tenant.id, code: 'GOI0001', kind: 'package',
      name: 'Liệu trình Meso Glutanex Glow - Peel căng bóng trắng sáng',
      categoryId: categories['Gói liệu trình'], unitId: units['Gói'],
      basePrice: '6000000', validityType: 'months', validityValue: 6,
    },
    {
      tenantId: tenant.id, code: 'GOI0002', kind: 'package',
      name: 'Liệu trình da mụn 10 buổi + phục hồi',
      categoryId: categories['Gói liệu trình'], unitId: units['Gói'],
      basePrice: '5000000', validityType: 'months', validityValue: 12,
    },

    // Thẻ tài khoản
    {
      tenantId: tenant.id, code: 'THE0001', kind: 'card',
      name: 'Thẻ tài khoản 5 triệu (tặng 500k)',
      categoryId: categories['Thẻ tài khoản'], unitId: units['Thẻ'],
      basePrice: '5000000', cardFaceValue: '5000000', cardBonusValue: '500000',
      validityType: 'months', validityValue: 12,
    },
    {
      tenantId: tenant.id, code: 'THE0002', kind: 'card',
      name: 'Thẻ tài khoản 10 triệu (tặng 1,5 triệu)',
      categoryId: categories['Thẻ tài khoản'], unitId: units['Thẻ'],
      basePrice: '10000000', cardFaceValue: '10000000', cardBonusValue: '1500000',
      validityType: 'unlimited',
    },
  ]

  const ids: Record<string, string> = {}
  for (const item of items) {
    const [row] = await db
      .insert(s.products)
      .values(item)
      .onConflictDoUpdate({
        target: [s.products.tenantId, s.products.code],
        set: { name: item.name, basePrice: item.basePrice },
      })
      .returning()
    ids[item.code!] = row.id
  }
  const byKind = items.reduce<Record<string, number>>((acc, i) => {
    acc[i.kind!] = (acc[i.kind!] ?? 0) + 1
    return acc
  }, {})
  console.log(`✓ ${items.length} hàng hoá:`, Object.entries(byKind).map(([k, n]) => `${k} ${n}`).join(' · '))

  // ── Thành phần gói ──
  // GOI0001: gói một loại dịch vụ -> phân bổ đều
  // GOI0002: gói hai loại -> phân bổ theo tỷ trọng giá lẻ (ADR-001 §1.3)
  const packageParts: [string, string, number, string][] = [
    ['GOI0001', 'DV0002', 4, '2000000'],
    ['GOI0002', 'DV0004', 10, '350000'],
    ['GOI0002', 'DV0001', 2, '500000'],
  ]
  for (const [pkg, svc, sessions, retail] of packageParts) {
    await db
      .insert(s.packageItems)
      .values({ packageId: ids[pkg], serviceId: ids[svc], sessions, retailPrice: retail })
      .onConflictDoUpdate({
        target: [s.packageItems.packageId, s.packageItems.serviceId],
        set: { sessions, retailPrice: retail },
      })
  }
  console.log(`✓ ${packageParts.length} thành phần gói`)

  // ── Định mức nguyên vật liệu ──
  const materials: [string, string, string][] = [
    ['DV0001', 'SP0004', '2'],
    ['DV0001', 'SP0005', '0.05'],
    ['DV0004', 'SP0004', '1'],
    ['DV0002', 'SP0002', '0.02'],
  ]
  for (const [svc, mat, qty] of materials) {
    await db
      .insert(s.serviceMaterials)
      .values({ serviceId: ids[svc], materialId: ids[mat], quantity: qty })
      .onConflictDoUpdate({
        target: [s.serviceMaterials.serviceId, s.serviceMaterials.materialId],
        set: { quantity: qty },
      })
  }
  console.log(`✓ ${materials.length} dòng định mức nguyên vật liệu`)

  // ── Tồn kho ban đầu ──
  const [branch] = await db
    .select().from(s.branches)
    .where(eq(s.branches.tenantId, tenant.id)).limit(1)
  const stock: [string, string][] = [
    ['SP0001', '25'], ['SP0002', '12'], ['SP0003', '8'], ['SP0004', '150'], ['SP0005', '6'],
  ]
  for (const [code, qty] of stock) {
    await db
      .insert(s.inventory)
      .values({ productId: ids[code], branchId: branch.id, onHand: qty })
      .onConflictDoUpdate({
        target: [s.inventory.productId, s.inventory.branchId],
        set: { onHand: qty },
      })
  }
  console.log(`✓ tồn kho ban đầu cho ${stock.length} sản phẩm\n`)

  console.log('Xong.')
  await pool.end()
}

main().catch((e) => {
  console.error('Seed danh mục thất bại:', e)
  process.exit(1)
})
