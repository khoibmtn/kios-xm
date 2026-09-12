import Link from 'next/link'
import { notFound } from 'next/navigation'
import { asc, eq } from 'drizzle-orm'
import { requirePermission } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { branches, employees, roles, userBranchRoles, users } from '@/lib/schema'
import { AccountForm } from './account-form'

export const metadata = { title: 'Tài khoản đăng nhập' }
export const dynamic = 'force-dynamic'

export default async function EmployeeAccountPage({
  params,
}: PageProps<'/admin/employees/[id]/account'>) {
  const user = await requirePermission('employee.manage')
  const { id } = await params

  const [employee] = await db
    .select({
      id: employees.id,
      tenantId: employees.tenantId,
      code: employees.code,
      fullName: employees.fullName,
      email: employees.email,
      userId: employees.userId,
    })
    .from(employees)
    .where(eq(employees.id, id))
    .limit(1)

  if (!employee || employee.tenantId !== user.tenantId) notFound()

  const [roleRows, branchRows] = await Promise.all([
    db
      .select({ value: roles.id, label: roles.name })
      .from(roles)
      .where(eq(roles.tenantId, user.tenantId))
      .orderBy(asc(roles.name)),
    db
      .select({ value: branches.id, label: branches.name })
      .from(branches)
      .where(eq(branches.tenantId, user.tenantId))
      .orderBy(asc(branches.name)),
  ])

  let account: {
    email: string
    isActive: boolean
    assignments: { branchId: string; branchName: string; roleId: string; roleName: string }[]
  } | null = null

  if (employee.userId) {
    const employeeUserId = employee.userId

    const [accountUserRows, assignments] = await Promise.all([
      db
        .select({ email: users.email, isActive: users.isActive })
        .from(users)
        .where(eq(users.id, employeeUserId))
        .limit(1),
      db
        .select({
          branchId: branches.id,
          branchName: branches.name,
          roleId: roles.id,
          roleName: roles.name,
        })
        .from(userBranchRoles)
        .innerJoin(branches, eq(branches.id, userBranchRoles.branchId))
        .innerJoin(roles, eq(roles.id, userBranchRoles.roleId))
        .where(eq(userBranchRoles.userId, employeeUserId)),
    ])

    const accountUser = accountUserRows[0]
    if (accountUser) {
      account = {
        email: accountUser.email ?? '(chưa có email)',
        isActive: accountUser.isActive,
        assignments,
      }
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <Link
          href={`/admin/employees/${employee.id}/edit`}
          className="text-muted-foreground text-sm hover:underline"
        >
          ← {employee.fullName}
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Tài khoản đăng nhập</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {employee.fullName} · {employee.code}
        </p>
      </div>

      <AccountForm
        employeeId={employee.id}
        roles={roleRows}
        branches={branchRows}
        defaultEmail={employee.email ?? ''}
        account={account}
      />
    </div>
  )
}
