import { GoogleDriveAdapter } from '../lib/storage/google-drive'
import { decryptSecret } from '../lib/crypto'

/**
 * Một chỗ duy nhất để hai kịch bản chạy ngoài ứng dụng (`backup.ts`,
 * `verify-backup.ts`) lấy quyền ghi lên Google Drive.
 *
 * Gộp lại vì chính chuyện "có hai chỗ phải nhớ" đã gây ra sự cố 13/09: job sao
 * lưu giữ một kết nối Drive riêng với ứng dụng, hai bên hết hạn cùng ngày,
 * người dùng sửa được một bên và không có cách nào biết bên kia vẫn hỏng.
 *
 * Ba đường, xét đúng thứ tự:
 *  1. `DRIVE_TOKEN_URL` — đường của GitHub Actions. Xin **access token ngắn
 *     hạn** từ ứng dụng, không giữ credential dài hạn nào.
 *  2. `GOOGLE_REFRESH_TOKEN` — chạy tay trên máy khi đã có sẵn token.
 *  3. Token trong cơ sở dữ liệu — chạy tay trên máy, cần `ENCRYPTION_KEY`.
 *     Cố ý không dùng ở CI: khoá ấy mở được MỌI dữ liệu đã mã hoá.
 */
export interface DriveSettings {
  driveRefreshToken: string | null
  driveRootFolderId: string | null
}

export async function driveForJobs(settings: DriveSettings | undefined): Promise<GoogleDriveAdapter> {
  const clientId = process.env.GOOGLE_CLIENT_ID!
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!

  if (process.env.DRIVE_TOKEN_URL) {
    console.log('   → xin access token ngắn hạn từ ứng dụng')
    const res = await fetch(process.env.DRIVE_TOKEN_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET ?? ''}` },
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(
        `Ứng dụng không cấp được token Drive (HTTP ${res.status}). ` +
          `Nhiều khả năng cần bấm "Kết nối lại" ở Thiết lập → Lưu trữ. ${body}`,
      )
    }
    const t = (await res.json()) as {
      accessToken: string
      expiresAt: number
      rootFolderId: string | null
    }
    return new GoogleDriveAdapter({
      clientId,
      clientSecret,
      accessToken: { token: t.accessToken, expiresAt: t.expiresAt },
      // Thư mục do ứng dụng chỉ định, không tự đi tìm — tránh đẻ thêm thư mục.
      rootFolderId: t.rootFolderId ?? settings?.driveRootFolderId ?? undefined,
    })
  }

  // `||` chứ không phải `??`: env.example để sẵn GOOGLE_REFRESH_TOKEN="", mà
  // `??` chỉ bắt null/undefined nên chuỗi rỗng sẽ lọt qua và gây lỗi xác thực.
  let refreshToken = process.env.GOOGLE_REFRESH_TOKEN || ''
  if (!refreshToken) {
    if (!settings?.driveRefreshToken) {
      throw new Error('Chưa kết nối Google Drive — không có nơi cất bản sao lưu')
    }
    console.log('   → dùng token trong cơ sở dữ liệu (cần ENCRYPTION_KEY)')
    refreshToken = await decryptSecret(settings.driveRefreshToken)
  } else {
    console.log('   → dùng token từ biến môi trường')
  }

  return new GoogleDriveAdapter({
    clientId,
    clientSecret,
    refreshToken,
    rootFolderId: settings?.driveRootFolderId ?? undefined,
  })
}
