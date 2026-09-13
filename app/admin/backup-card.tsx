import Link from 'next/link'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { tenantSettings } from '@/lib/schema'
import { assessDrive, type DriveLevel } from '@/lib/storage/drive-status'
import { formatDateTime, formatRelative } from '@/lib/format'

/**
 * Thẻ "Sao lưu & lưu trữ" trên màn hình Tổng quan.
 *
 * Có mặt vì đêm 12→13/09 sao lưu hỏng và người duy nhất biết là GitHub, qua
 * một email lúc 4 giờ sáng. Ứng dụng thì im lặng hoàn toàn. Thẻ này để câu
 * "sao lưu có đang chạy không" trả lời được ngay khi mở phần mềm, thay vì phải
 * đi tìm.
 *
 * Chỉ hiện với người có quyền `settings.manage` — lễ tân không cần biết và
 * cũng không làm gì được với thông tin này.
 */

const TONE: Record<DriveLevel, { box: string; dot: string; label: string }> = {
  ok: {
    box: 'border-success/30 bg-success/5',
    dot: 'bg-success',
    label: 'text-success',
  },
  warn: {
    box: 'border-warning/40 bg-warning/5',
    dot: 'bg-warning',
    label: 'text-warning',
  },
  error: {
    box: 'border-danger/40 bg-danger/5',
    dot: 'bg-danger',
    label: 'text-danger',
  },
}

export async function BackupCard({ tenantId }: { tenantId: string }) {
  const [settings] = await db
    .select({
      connectedAt: tenantSettings.driveConnectedAt,
      connectedEmail: tenantSettings.driveConnectedEmail,
      lastBackupAt: tenantSettings.driveLastBackupAt,
      lastBackupName: tenantSettings.driveLastBackupName,
    })
    .from(tenantSettings)
    .where(eq(tenantSettings.tenantId, tenantId))

  // Bật lên sau khi OAuth app được Google duyệt sang "In production"; lúc đó
  // refresh token hết hạn 7 ngày biến mất và phần đếm ngược tự ẩn đi.
  const oauthPublished = process.env.GOOGLE_OAUTH_PUBLISHED === 'true'

  const status = assessDrive({
    connectedAt: settings?.connectedAt ?? null,
    connectedEmail: settings?.connectedEmail ?? null,
    lastBackupAt: settings?.lastBackupAt ?? null,
    oauthPublished,
  })

  const tone = TONE[status.level]

  return (
    <section className={`rounded-lg border p-5 ${tone.box}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-semibold">
            <span aria-hidden className={`size-2 shrink-0 rounded-full ${tone.dot}`} />
            <span className={tone.label}>{status.headline}</span>
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">{status.detail}</p>
          {status.action && (
            <p className="mt-1 text-sm font-medium">{status.action}</p>
          )}
        </div>
        <Link
          href="/admin/settings/storage"
          className="border-border hover:bg-muted shrink-0 rounded-md border px-3 py-1.5 text-sm font-medium"
        >
          {settings?.connectedAt ? 'Kết nối lại' : 'Kết nối'}
        </Link>
      </div>

      <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-muted-foreground">Tài khoản Drive</dt>
          <dd className="truncate font-medium">{settings?.connectedEmail ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Sao lưu gần nhất</dt>
          <dd className="font-medium">
            {settings?.lastBackupAt ? formatRelative(settings.lastBackupAt) : 'Chưa có'}
          </dd>
          {settings?.lastBackupAt && (
            <dd className="text-muted-foreground text-xs">
              {formatDateTime(settings.lastBackupAt)}
            </dd>
          )}
        </div>
        <div>
          <dt className="text-muted-foreground">Kết nối còn hạn</dt>
          <dd className="font-medium">
            {status.expiresInDays === null
              ? 'Không giới hạn'
              : status.expiresInDays <= 0
                ? 'Đã hết hạn'
                : `${Math.floor(status.expiresInDays)} ngày`}
          </dd>
        </div>
      </dl>

      {!oauthPublished && (
        <QuyetDinhTenMien />
      )}
    </section>
  )
}

/**
 * Một quyết định đang chờ anh Khôi, để ngay chỗ nó gây phiền thay vì chôn
 * trong tài liệu. Xem `ADR-002 §2.6`.
 */
function QuyetDinhTenMien() {
  return (
    <details className="border-border/60 mt-4 border-t pt-3 text-sm">
      <summary className="text-muted-foreground cursor-pointer font-medium">
        Vì sao cứ 7 ngày lại phải kết nối lại?
      </summary>
      <div className="text-muted-foreground mt-2 space-y-2">
        <p>
          Google chỉ cho phép kết nối 7 ngày mỗi lần khi ứng dụng chưa được xét duyệt. Muốn
          được duyệt thì phải khai một tên miền và chứng minh mình sở hữu nó — mà địa chỉ
          hiện tại <code className="text-xs">kios-xm.spa-xumay.workers.dev</code> bị Google
          rút gọn về <code className="text-xs">spa-xumay.workers.dev</code>, một địa chỉ của
          Cloudflare chứ không phải của spa, nên không xác minh được.
        </p>
        <p>
          <strong className="text-foreground">Quyết định khi đưa vào chạy thật:</strong> mua
          một tên miền riêng (khoảng 250.000 đ/năm) thì việc kết nối lại biến mất hẳn. Không
          mua thì mỗi tuần bấm lại một lần — bấm một lần là cả phần mềm lẫn sao lưu cùng
          chạy, không còn chỗ nào âm thầm hỏng.
        </p>
      </div>
    </details>
  )
}
