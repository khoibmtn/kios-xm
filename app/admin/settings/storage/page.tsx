import Link from 'next/link'
import { requirePermission } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { getStorage } from '@/lib/storage'

export const metadata = { title: 'Lưu trữ tệp' }
export const dynamic = 'force-dynamic'

export default async function StorageSettingsPage({
  searchParams,
}: PageProps<'/admin/settings/storage'>) {
  const user = await requirePermission('settings.manage')
  const params = await searchParams

  const settings = await db.tenantSettings.findUnique({
    where: { tenantId: user.tenantId },
    select: {
      driveRefreshToken: true,
      driveRootFolderId: true,
      driveConnectedAt: true,
      driveConnectedEmail: true,
    },
  })

  const connected = !!settings?.driveRefreshToken

  // Gọi thử Drive để biết token còn sống hay đã hết hạn.
  let health: { ok: boolean; message?: string } | null = null
  if (connected) {
    try {
      health = await (await getStorage(user.tenantId)).healthCheck()
    } catch (error) {
      health = {
        ok: false,
        message: error instanceof Error ? error.message : 'Không kiểm tra được',
      }
    }
  }

  const errorMsg = typeof params.error === 'string' ? params.error : null
  const justConnected = params.connected === '1'

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href="/admin" className="text-muted-foreground text-sm hover:underline">
          ← Tổng quan
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Lưu trữ tệp</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Ảnh trước/sau, ảnh hàng hoá và bản sao lưu được cất trên Google Drive của spa.
        </p>
      </div>

      {justConnected && (
        <p className="text-success bg-success/10 rounded-md px-4 py-3 text-sm">
          Đã kết nối Google Drive thành công.
        </p>
      )}
      {errorMsg && (
        <p role="alert" className="text-danger bg-danger/10 rounded-md px-4 py-3 text-sm">
          {errorMsg}
        </p>
      )}

      <section className="border-border bg-card rounded-lg border p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold">Google Drive</h2>
            <p className="text-muted-foreground mt-0.5 text-sm">
              {connected ? 'Đã kết nối' : 'Chưa kết nối'}
            </p>
          </div>
          <span
            aria-hidden
            className={`mt-1 size-2.5 shrink-0 rounded-full ${
              !connected
                ? 'bg-muted-foreground/40'
                : health?.ok
                  ? 'bg-success'
                  : 'bg-danger'
            }`}
          />
        </div>

        {connected && (
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Tài khoản</dt>
              <dd className="text-right font-medium">
                {settings?.driveConnectedEmail ?? '—'}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Kết nối lúc</dt>
              <dd className="text-right font-medium">
                {settings?.driveConnectedAt
                  ? new Intl.DateTimeFormat('vi-VN', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                      timeZone: 'Asia/Ho_Chi_Minh',
                    }).format(settings.driveConnectedAt)
                  : '—'}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Trạng thái</dt>
              <dd
                className={`text-right font-medium ${health?.ok ? 'text-success' : 'text-danger'}`}
              >
                {health?.ok ? health.message : (health?.message ?? 'Không rõ')}
              </dd>
            </div>
          </dl>
        )}

        <div className="mt-5">
          <a
            href="/api/drive/connect"
            className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center rounded-md px-4 py-2.5 text-sm font-medium"
          >
            {connected ? 'Kết nối lại' : 'Kết nối Google Drive'}
          </a>
        </div>
      </section>

      <section className="border-border bg-muted/40 rounded-lg border p-5 text-sm">
        <h2 className="font-semibold">Vài điều nên biết</h2>
        <ul className="text-muted-foreground mt-2 space-y-2">
          <li>
            Ứng dụng dùng quyền hẹp nhất của Google (<code>drive.file</code>): chỉ đọc và
            ghi được những tệp do chính nó tạo, <strong>không</strong> thấy phần còn lại
            trong Drive của anh/chị.
          </li>
          <li>
            Vì vậy ứng dụng tự tạo thư mục <code>kios-xm-data</code>. Anh/chị có thể kéo
            thư mục đó tới bất kỳ đâu trong Drive — quyền gắn với tệp, không gắn với
            vị trí, nên mọi thứ vẫn chạy bình thường.
          </li>
          <li>
            Khi ứng dụng OAuth còn ở trạng thái thử nghiệm của Google, kết nối sẽ hết hạn
            sau khoảng 7 ngày và cần bấm <em>Kết nối lại</em>. Ảnh chờ tải lên không bị
            mất — hệ thống giữ lại và tự gửi tiếp sau khi kết nối được khôi phục.
          </li>
        </ul>
      </section>
    </div>
  )
}
