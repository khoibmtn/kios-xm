import Link from 'next/link'
import { eq } from 'drizzle-orm'
import { requirePermission, can } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { tenantFeatures, tenantSettings } from '@/lib/schema'
import { SettingsForm, type SettingsData } from './settings-form'

export const metadata = { title: 'Cấu hình chung' }
export const dynamic = 'force-dynamic'

/** Mặc định khi spa chưa có dòng thiết lập nào — khớp DEFAULT của cơ sở dữ liệu. */
const DEFAULTS: SettingsData = {
  bookingSlotMinutes: 30,
  bookingBufferMinutes: 5,
  limitBookingToShift: false,
  packageRevenueAllocationMode: 'proportional_retail',
  costingMethod: 'average',
  bookClosedUntil: '',
}

export default async function SettingsPage() {
  const user = await requirePermission('settings.manage')

  const [settingsRows, featureRows] = await Promise.all([
    db
      .select({
        bookingSlotMinutes: tenantSettings.bookingSlotMinutes,
        bookingBufferMinutes: tenantSettings.bookingBufferMinutes,
        limitBookingToShift: tenantSettings.limitBookingToShift,
        packageRevenueAllocationMode: tenantSettings.packageRevenueAllocationMode,
        costingMethod: tenantSettings.costingMethod,
        bookClosedUntil: tenantSettings.bookClosedUntil,
      })
      .from(tenantSettings)
      .where(eq(tenantSettings.tenantId, user.tenantId))
      .limit(1),

    db
      .select({ key: tenantFeatures.featureKey, enabled: tenantFeatures.enabled })
      .from(tenantFeatures)
      .where(eq(tenantFeatures.tenantId, user.tenantId)),
  ])

  const row = settingsRows[0]
  const initial: SettingsData = row
    ? { ...row, bookClosedUntil: row.bookClosedUntil ?? '' }
    : DEFAULTS

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Cấu hình chung</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Thiết lập áp dụng cho toàn bộ spa.{' '}
          <Link href="/admin/settings/storage" className="text-primary hover:underline">
            Kết nối Google Drive
          </Link>{' '}
          nằm ở màn hình riêng.
        </p>
      </div>

      <SettingsForm
        initial={initial}
        features={Object.fromEntries(featureRows.map((f) => [f.key, f.enabled]))}
        canManage={can(user, 'settings.manage')}
      />
    </div>
  )
}
