import { requireSession, can } from '@/lib/auth/session'
import { PERMISSIONS, type Permission } from '@/lib/auth/permissions'

export const metadata = { title: 'Tổng quan' }

/** Nhóm quyền theo tiền tố để bảng dễ đọc. */
const GROUP_LABELS: Record<string, string> = {
  financial: 'Tài chính',
  product: 'Hàng hoá',
  inventory: 'Kho',
  customer: 'Khách hàng',
  medical: 'Hồ sơ y tế',
  booking: 'Lịch hẹn',
  invoice: 'Bán hàng',
  package: 'Gói & thẻ',
  employee: 'Nhân sự',
  report: 'Báo cáo',
  settings: 'Hệ thống',
}

export default async function AdminHomePage() {
  const user = await requireSession()

  const groups = Object.entries(GROUP_LABELS).map(([prefix, label]) => ({
    label,
    items: (Object.keys(PERMISSIONS) as Permission[])
      .filter((p) => p.startsWith(`${prefix}.`))
      .map((p) => ({ key: p, label: PERMISSIONS[p], granted: can(user, p) })),
  }))

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <section>
        <h1 className="text-2xl font-bold tracking-tight">Tổng quan</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Nền móng đã dựng xong. Các phân hệ nghiệp vụ sẽ lần lượt xuất hiện ở đây.
        </p>
      </section>

      <section className="border-border bg-card rounded-lg border p-5">
        <h2 className="font-semibold">Phiên làm việc</h2>
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div className="flex justify-between gap-4 sm:block">
            <dt className="text-muted-foreground">Spa</dt>
            <dd className="font-medium">{user.tenantName}</dd>
          </div>
          <div className="flex justify-between gap-4 sm:block">
            <dt className="text-muted-foreground">Chi nhánh</dt>
            <dd className="font-medium">{user.branchName}</dd>
          </div>
          <div className="flex justify-between gap-4 sm:block">
            <dt className="text-muted-foreground">Vai trò</dt>
            <dd className="font-medium">{user.roleCodes.join(', ')}</dd>
          </div>
          <div className="flex justify-between gap-4 sm:block">
            <dt className="text-muted-foreground">Hồ sơ nhân viên</dt>
            <dd className="font-medium">
              {user.employeeId ? 'Đã liên kết' : 'Chưa liên kết'}
            </dd>
          </div>
        </dl>
      </section>

      <section className="border-border bg-card rounded-lg border p-5">
        <h2 className="font-semibold">
          Quyền được cấp{' '}
          <span className="text-muted-foreground font-normal">
            ({user.permissions.length}/{Object.keys(PERMISSIONS).length})
          </span>
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Kiểm chứng phân quyền: đăng nhập bằng tài khoản lễ tân sẽ thấy các mục
          giá vốn và lợi nhuận chuyển sang trạng thái không được cấp.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {groups.map((g) => (
            <div key={g.label}>
              <h3 className="text-muted-foreground mb-1.5 text-xs font-semibold tracking-wide uppercase">
                {g.label}
              </h3>
              <ul className="space-y-1 text-sm">
                {g.items.map((item) => (
                  <li key={item.key} className="flex items-start gap-2">
                    <span
                      aria-hidden
                      className={
                        item.granted
                          ? 'text-success mt-0.5'
                          : 'text-muted-foreground/40 mt-0.5'
                      }
                    >
                      {item.granted ? '✓' : '·'}
                    </span>
                    <span
                      className={item.granted ? '' : 'text-muted-foreground/60'}
                    >
                      {item.label}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
