import { NextResponse, type NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { tenantSettings, tenants } from '@/lib/schema'
import { decryptSecret } from '@/lib/crypto'
import { GoogleDriveAdapter } from '@/lib/storage'

export const dynamic = 'force-dynamic'

/**
 * Cấp một **access token ngắn hạn** của Google Drive cho kịch bản sao lưu.
 *
 * Vì sao endpoint này tồn tại. Trước 13/09 job sao lưu trên GitHub Actions giữ
 * một secret riêng `GOOGLE_REFRESH_TOKEN`. Thành ra có **hai** kết nối Drive
 * song song, cấp cùng ngày và hết hạn cùng ngày — mà chỉ một cái có nút bấm để
 * sửa. Hôm 12/09 anh Khôi bấm "Kết nối lại" trong ứng dụng; token của ứng dụng
 * sống lại, còn secret trên GitHub thì không ai đụng tới, nên 04:05 hôm sau sao
 * lưu đổ. Không ai làm sai cả — cấu trúc bắt phải nhớ hai chỗ thì sớm muộn cũng
 * quên một chỗ.
 *
 * ⇒ Giờ chỉ còn **một** kết nối, nằm trong cơ sở dữ liệu. GitHub hỏi xin token
 * mỗi lần chạy. Bấm "Kết nối lại" một lần là cả ứng dụng lẫn sao lưu cùng sống.
 *
 * Vì sao trả access token chứ không phải refresh token:
 *  - Access token sống ~1 giờ. Refresh token sống tới khi bị thu hồi.
 *  - Cả hai đều chỉ trong scope `drive.file` — chạm được đúng những tệp do ứng
 *    dụng này tạo, không phải cả Drive của anh Khôi.
 *  - Nếu log của GitHub Actions lỡ lộ ra, một bên là thiệt hại trong một giờ,
 *    bên kia là vĩnh viễn.
 *
 * Và vì sao **không** đưa `ENCRYPTION_KEY` lên GitHub để job tự giải mã: khoá
 * đó mở được mọi dữ liệu nhạy cảm đã mã hoá, không riêng token Drive.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'Chưa cấu hình CRON_SECRET' }, { status: 500 })
  }

  const provided = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (provided !== secret) {
    return NextResponse.json({ error: 'Không được phép' }, { status: 401 })
  }

  try {
    const [tenant] = await db.select({ id: tenants.id }).from(tenants).limit(1)
    if (!tenant) {
      return NextResponse.json({ error: 'Chưa có spa nào trong hệ thống' }, { status: 404 })
    }

    const [settings] = await db
      .select({
        refreshToken: tenantSettings.driveRefreshToken,
        rootFolderId: tenantSettings.driveRootFolderId,
      })
      .from(tenantSettings)
      .where(eq(tenantSettings.tenantId, tenant.id))

    if (!settings?.refreshToken) {
      return NextResponse.json(
        { error: 'Chưa kết nối Google Drive. Vào Thiết lập → Lưu trữ để kết nối.' },
        { status: 409 },
      )
    }

    const adapter = new GoogleDriveAdapter({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      refreshToken: await decryptSecret(settings.refreshToken),
      rootFolderId: settings.rootFolderId ?? undefined,
    })

    const { accessToken, expiresAt } = await adapter.issueAccessToken()

    // `rootFolderId` đi kèm để job sao lưu ghi đúng thư mục mà ứng dụng đang
    // dùng — không tự đi tìm rồi lỡ tạo ra một thư mục thứ hai.
    return NextResponse.json({
      accessToken,
      expiresAt,
      rootFolderId: settings.rootFolderId ?? null,
    })
  } catch (error) {
    // Chi tiết vào log (đọc bằng `wrangler tail`), không trả ra ngoài.
    console.error('[drive-token]', error instanceof Error ? error.message : String(error))
    return NextResponse.json(
      { error: 'Không cấp được token Drive. Kết nối có thể đã hết hạn.' },
      { status: 502 },
    )
  }
}
