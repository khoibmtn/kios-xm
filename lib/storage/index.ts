import { db } from '@/lib/db'
import { decryptSecret } from '@/lib/crypto'
import { GoogleDriveAdapter } from './google-drive'
import { StorageAuthError, type StorageAdapter } from './types'

export * from './types'
export { GoogleDriveAdapter } from './google-drive'

/**
 * Tạo adapter lưu trữ cho một spa.
 *
 * Hôm nay chỉ có Google Drive; khi thêm R2 thì rẽ nhánh tại đây, phần còn lại
 * của hệ thống không phải sửa gì.
 */
export async function getStorage(tenantId: string): Promise<StorageAdapter> {
  const settings = await db.tenantSettings.findUnique({
    where: { tenantId },
    select: { driveRefreshToken: true, driveRootFolderId: true },
  })

  if (!settings?.driveRefreshToken) {
    throw new StorageAuthError(
      'Chưa kết nối Google Drive. Vào Thiết lập → Lưu trữ để kết nối.',
    )
  }

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('Thiếu GOOGLE_CLIENT_ID hoặc GOOGLE_CLIENT_SECRET')
  }

  return new GoogleDriveAdapter({
    clientId,
    clientSecret,
    refreshToken: await decryptSecret(settings.driveRefreshToken),
    rootFolderId: settings.driveRootFolderId ?? undefined,
  })
}

/** Đã kết nối lưu trữ chưa — dùng để hiện cảnh báo trên giao diện. */
export async function isStorageConnected(tenantId: string): Promise<boolean> {
  const settings = await db.tenantSettings.findUnique({
    where: { tenantId },
    select: { driveRefreshToken: true },
  })
  return !!settings?.driveRefreshToken
}
