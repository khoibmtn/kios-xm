import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local', override: true })

import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { SYSTEM_ROLES } from '../lib/auth/permissions'

const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL! })
const db = new PrismaClient({ adapter })

/** Mật khẩu khởi tạo — PHẢI đổi ngay sau lần đăng nhập đầu. */
const SEED_PASSWORD = process.env.SEED_OWNER_PASSWORD ?? 'KiosXM@2026'
const OWNER_EMAIL = process.env.SEED_OWNER_EMAIL ?? 'khoibm.tn@gmail.com'

async function main() {
  console.log('→ Đang tạo dữ liệu khởi tạo...\n')

  const tenant = await db.tenant.upsert({
    where: { code: 'xumay' },
    update: {},
    create: { code: 'xumay', name: 'Spa Xumây', plan: 'free' },
  })
  console.log(`  ✓ Spa: ${tenant.name}`)

  const branch = await db.branch.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: 'Chi nhánh trung tâm' } },
    update: {},
    create: {
      tenantId: tenant.id,
      name: 'Chi nhánh trung tâm',
      isDefault: true,
      timezone: 'Asia/Ho_Chi_Minh',
    },
  })
  console.log(`  ✓ Chi nhánh: ${branch.name}`)

  // Vai trò dựng sẵn
  const roles: Record<string, string> = {}
  for (const [code, def] of Object.entries(SYSTEM_ROLES)) {
    const role = await db.role.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code } },
      update: { permissions: def.permissions as string[], name: def.name },
      create: {
        tenantId: tenant.id,
        code,
        name: def.name,
        permissions: def.permissions as string[],
        isSystem: true,
      },
    })
    roles[code] = role.id
    console.log(`  ✓ Vai trò: ${def.name} (${def.permissions.length} quyền)`)
  }

  // Tài khoản chủ spa
  const owner = await db.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: OWNER_EMAIL } },
    update: {},
    create: {
      tenantId: tenant.id,
      email: OWNER_EMAIL,
      fullName: 'Chủ spa',
      passwordHash: await bcrypt.hash(SEED_PASSWORD, 10),
    },
  })

  await db.userBranchRole.upsert({
    where: {
      userId_branchId_roleId: { userId: owner.id, branchId: branch.id, roleId: roles.owner },
    },
    update: {},
    create: { userId: owner.id, branchId: branch.id, roleId: roles.owner },
  })
  console.log(`  ✓ Tài khoản chủ: ${OWNER_EMAIL}`)

  // Nhân viên gắn với tài khoản chủ (Employee ≠ User — AGENTS.md §3b quy tắc 1)
  await db.employee.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'NV000001' } },
    update: {},
    create: {
      tenantId: tenant.id,
      userId: owner.id,
      code: 'NV000001',
      fullName: 'Chủ spa',
      workBranchId: branch.id,
      payBranchId: branch.id,
    },
  })
  console.log('  ✓ Nhân viên: NV000001')

  // Cấu hình mặc định
  await db.tenantSettings.upsert({
    where: { tenantId: tenant.id },
    update: {},
    create: { tenantId: tenant.id },
  })

  const features = [
    ['clinic', false],
    ['promotion', false],
    ['voucher', false],
    ['loyalty', false],
    ['online_booking', false],
    ['service_rating', true],
  ] as const
  for (const [key, enabled] of features) {
    await db.tenantFeature.upsert({
      where: { tenantId_featureKey: { tenantId: tenant.id, featureKey: key } },
      update: {},
      create: { tenantId: tenant.id, featureKey: key, enabled },
    })
  }
  console.log(`  ✓ Cấu hình mặc định + ${features.length} tính năng bật/tắt\n`)

  console.log('Xong. Đăng nhập bằng:')
  console.log(`  Email    : ${OWNER_EMAIL}`)
  console.log(`  Mật khẩu : ${SEED_PASSWORD}`)
  console.log('\n  ⚠ Đổi mật khẩu ngay sau lần đăng nhập đầu tiên.')
}

main()
  .catch((e) => {
    console.error('Seed thất bại:', e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
