import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local', override: true })

import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import bcrypt from 'bcryptjs'
import * as s from '../lib/schema'
import { SYSTEM_ROLES } from '../lib/auth/permissions'

const pool = new Pool({ connectionString: process.env.DIRECT_URL })
const db = drizzle(pool, { casing: 'snake_case' })

/** Mật khẩu khởi tạo — PHẢI đổi ngay sau lần đăng nhập đầu. */
const SEED_PASSWORD = process.env.SEED_OWNER_PASSWORD ?? 'KiosXM@2026'
const OWNER_EMAIL = process.env.SEED_OWNER_EMAIL ?? 'khoibm.tn@gmail.com'

async function main() {
  console.log('→ Đang tạo dữ liệu khởi tạo...\n')

  const [tenant] = await db
    .insert(s.tenants)
    .values({ code: 'xumay', name: 'Spa Xumây', plan: 'free' })
    .onConflictDoUpdate({ target: s.tenants.code, set: { name: 'Spa Xumây' } })
    .returning()
  console.log(`  ✓ Spa: ${tenant.name}`)

  const [branch] = await db
    .insert(s.branches)
    .values({
      tenantId: tenant.id,
      name: 'Chi nhánh trung tâm',
      isDefault: true,
      timezone: 'Asia/Ho_Chi_Minh',
    })
    .onConflictDoUpdate({
      target: [s.branches.tenantId, s.branches.name],
      set: { isDefault: true },
    })
    .returning()
  console.log(`  ✓ Chi nhánh: ${branch.name}`)

  const roleIds: Record<string, string> = {}
  for (const [code, def] of Object.entries(SYSTEM_ROLES)) {
    const [role] = await db
      .insert(s.roles)
      .values({
        tenantId: tenant.id,
        code,
        name: def.name,
        permissions: [...def.permissions],
        isSystem: true,
      })
      .onConflictDoUpdate({
        target: [s.roles.tenantId, s.roles.code],
        set: { name: def.name, permissions: [...def.permissions] },
      })
      .returning()
    roleIds[code] = role.id
    console.log(`  ✓ Vai trò: ${def.name} (${def.permissions.length} quyền)`)
  }

  async function upsertStaff(
    email: string,
    fullName: string,
    roleCode: string,
    empCode: string,
  ) {
    const [user] = await db
      .insert(s.users)
      .values({
        tenantId: tenant.id,
        email,
        fullName,
        passwordHash: await bcrypt.hash(SEED_PASSWORD, 10),
      })
      .onConflictDoUpdate({
        target: [s.users.tenantId, s.users.email],
        set: { fullName },
      })
      .returning()

    await db
      .insert(s.userBranchRoles)
      .values({ userId: user.id, branchId: branch.id, roleId: roleIds[roleCode] })
      .onConflictDoNothing()

    await db
      .insert(s.employees)
      .values({
        tenantId: tenant.id,
        userId: user.id,
        code: empCode,
        fullName,
        workBranchId: branch.id,
        payBranchId: branch.id,
      })
      .onConflictDoUpdate({
        target: [s.employees.tenantId, s.employees.code],
        set: { fullName },
      })

    console.log(`  ✓ ${fullName}: ${email} (${roleCode}, ${empCode})`)
  }

  await upsertStaff(OWNER_EMAIL, 'Chủ spa', 'owner', 'NV000001')
  await upsertStaff('letan@spa.local', 'Lễ tân demo', 'receptionist', 'NV000002')

  await db
    .insert(s.tenantSettings)
    .values({ tenantId: tenant.id })
    .onConflictDoNothing()

  const features: [string, boolean][] = [
    ['clinic', false],
    ['promotion', false],
    ['voucher', false],
    ['loyalty', false],
    ['online_booking', false],
    ['service_rating', true],
  ]
  for (const [featureKey, enabled] of features) {
    await db
      .insert(s.tenantFeatures)
      .values({ tenantId: tenant.id, featureKey, enabled })
      .onConflictDoNothing()
  }
  console.log(`  ✓ Cấu hình mặc định + ${features.length} tính năng bật/tắt\n`)

  console.log('Xong. Đăng nhập bằng:')
  console.log(`  Chủ spa : ${OWNER_EMAIL}`)
  console.log(`  Lễ tân  : letan@spa.local`)
  console.log(`  Mật khẩu: ${SEED_PASSWORD}`)
  console.log('\n  ⚠ Đổi mật khẩu ngay sau lần đăng nhập đầu tiên.')
}

main()
  .catch((e) => {
    console.error('Seed thất bại:', e)
    process.exit(1)
  })
  .finally(() => pool.end())
