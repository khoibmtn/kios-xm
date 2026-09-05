import {
  StorageAuthError,
  StorageTransientError,
  type PutOptions,
  type StorageAdapter,
  type StoredFileMeta,
} from './types'

/**
 * Google Drive qua REST API bằng `fetch`.
 *
 * Cố ý KHÔNG dùng thư viện `googleapis`: nó kéo theo nhiều API của Node và
 * không chạy được trên Cloudflare Workers, trong khi ta chỉ cần 5 lệnh gọi.
 *
 * Scope `drive.file` chỉ với tới tệp do chính ứng dụng tạo, nên thư mục gốc
 * phải do ứng dụng tự tạo (ADR-002 §2.2).
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const API = 'https://www.googleapis.com/drive/v3'
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3'
const FOLDER_MIME = 'application/vnd.google-apps.folder'

export interface GoogleDriveConfig {
  clientId: string
  clientSecret: string
  refreshToken: string
  /** Thư mục gốc do ứng dụng tạo; bỏ trống thì `ensureRootFolder` sẽ tạo mới. */
  rootFolderId?: string
}

interface CachedToken {
  accessToken: string
  expiresAt: number
}

export class GoogleDriveAdapter implements StorageAdapter {
  readonly provider = 'google_drive'

  private token: CachedToken | null = null
  private folderCache = new Map<string, string>()

  constructor(private config: GoogleDriveConfig) {}

  // ───────────────────────── Xác thực ─────────────────────────

  private async getAccessToken(): Promise<string> {
    // Trừ hao 60 giây để không dùng đúng lúc token vừa hết hạn
    if (this.token && this.token.expiresAt > Date.now() + 60_000) {
      return this.token.accessToken
    }

    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        refresh_token: this.config.refreshToken,
        grant_type: 'refresh_token',
      }),
    })

    if (!res.ok) {
      const body = await res.text()
      // invalid_grant = refresh token đã bị thu hồi hoặc hết hạn.
      // Ở chế độ Testing của Google, token hết hạn sau 7 ngày (ADR-002 §2.6).
      if (res.status === 400 || res.status === 401) {
        throw new StorageAuthError(
          'Kết nối Google Drive đã hết hạn. Vào Thiết lập → Lưu trữ để kết nối lại.',
        )
      }
      throw new StorageTransientError(`Không lấy được access token (${res.status}): ${body}`)
    }

    const json = (await res.json()) as { access_token: string; expires_in: number }
    this.token = {
      accessToken: json.access_token,
      expiresAt: Date.now() + json.expires_in * 1000,
    }
    return json.access_token
  }

  private async call(url: string, init: RequestInit = {}): Promise<Response> {
    const token = await this.getAccessToken()
    const res = await fetch(url, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${token}` },
    })

    if (res.status === 401) {
      this.token = null
      throw new StorageAuthError('Google Drive từ chối truy cập. Cần kết nối lại.')
    }
    if (res.status === 403) {
      const body = await res.text()
      if (body.includes('rateLimitExceeded') || body.includes('userRateLimitExceeded')) {
        throw new StorageTransientError('Google Drive đang giới hạn tần suất, sẽ thử lại sau.')
      }
      throw new StorageAuthError(`Google Drive từ chối (403): ${body}`)
    }
    if (res.status >= 500) {
      throw new StorageTransientError(`Google Drive lỗi máy chủ (${res.status})`)
    }

    return res
  }

  // ───────────────────────── Thư mục ─────────────────────────

  /**
   * Tạo thư mục gốc nếu chưa có. Trả về id để lưu vào tenant_settings.
   * Người dùng có thể tự kéo thư mục này đi nơi khác trong Drive — quyền gắn
   * với tệp chứ không gắn với vị trí, nên ứng dụng vẫn ghi được.
   */
  async ensureRootFolder(name = 'kios-xm-data'): Promise<string> {
    if (this.config.rootFolderId) return this.config.rootFolderId

    const id = await this.createFolder(name, undefined)
    this.config.rootFolderId = id
    return id
  }

  private async createFolder(name: string, parentId?: string): Promise<string> {
    const res = await this.call(`${API}/files?fields=id`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        mimeType: FOLDER_MIME,
        ...(parentId ? { parents: [parentId] } : {}),
      }),
    })

    if (!res.ok) {
      throw new StorageTransientError(`Không tạo được thư mục "${name}": ${await res.text()}`)
    }

    const json = (await res.json()) as { id: string }
    return json.id
  }

  private async findChildFolder(name: string, parentId: string): Promise<string | null> {
    const q = [
      `name = '${name.replace(/'/g, "\\'")}'`,
      `mimeType = '${FOLDER_MIME}'`,
      `'${parentId}' in parents`,
      'trashed = false',
    ].join(' and ')

    const res = await this.call(`${API}/files?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1`)
    if (!res.ok) return null

    const json = (await res.json()) as { files: { id: string }[] }
    return json.files[0]?.id ?? null
  }

  /** Tạo dần từng cấp thư mục theo đường dẫn "customers/2026/09". */
  private async ensureFolderPath(path: string): Promise<string> {
    const root = await this.ensureRootFolder()
    const segments = path.split('/').filter(Boolean)
    if (segments.length === 0) return root

    let parentId = root
    let walked = ''

    for (const segment of segments) {
      walked = walked ? `${walked}/${segment}` : segment

      const cached = this.folderCache.get(walked)
      if (cached) {
        parentId = cached
        continue
      }

      const existing = await this.findChildFolder(segment, parentId)
      parentId = existing ?? (await this.createFolder(segment, parentId))
      this.folderCache.set(walked, parentId)
    }

    return parentId
  }

  // ───────────────────────── Tệp ─────────────────────────

  async put(options: PutOptions): Promise<StoredFileMeta> {
    const lastSlash = options.path.lastIndexOf('/')
    const dir = lastSlash > 0 ? options.path.slice(0, lastSlash) : ''
    const fileName = lastSlash > 0 ? options.path.slice(lastSlash + 1) : options.path

    const parentId = await this.ensureFolderPath(dir)

    const bytes =
      options.data instanceof Uint8Array ? options.data : new Uint8Array(options.data)

    // Upload multipart: phần 1 là siêu dữ liệu JSON, phần 2 là nội dung.
    const boundary = `kiosxm-${crypto.randomUUID()}`
    const meta = JSON.stringify({ name: fileName, parents: [parentId] })

    const head = new TextEncoder().encode(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n` +
        `--${boundary}\r\nContent-Type: ${options.mime}\r\n\r\n`,
    )
    const tail = new TextEncoder().encode(`\r\n--${boundary}--`)

    const body = new Uint8Array(head.length + bytes.length + tail.length)
    body.set(head, 0)
    body.set(bytes, head.length)
    body.set(tail, head.length + bytes.length)

    const res = await this.call(
      `${UPLOAD_API}/files?uploadType=multipart&fields=id,name,size,md5Checksum`,
      {
        method: 'POST',
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
        body,
      },
    )

    if (!res.ok) {
      throw new StorageTransientError(`Tải tệp lên thất bại: ${await res.text()}`)
    }

    const json = (await res.json()) as {
      id: string
      size?: string
      md5Checksum?: string
    }

    return {
      externalId: json.id,
      path: options.path,
      mime: options.mime,
      size: json.size ? Number(json.size) : bytes.length,
      checksum: json.md5Checksum,
    }
  }

  async get(externalId: string): Promise<{ data: ArrayBuffer; mime: string }> {
    const res = await this.call(`${API}/files/${externalId}?alt=media`)
    if (!res.ok) {
      throw new StorageTransientError(`Không tải được tệp: ${res.status}`)
    }

    return {
      data: await res.arrayBuffer(),
      mime: res.headers.get('content-type') ?? 'application/octet-stream',
    }
  }

  async delete(externalId: string): Promise<void> {
    const res = await this.call(`${API}/files/${externalId}`, { method: 'DELETE' })
    // 404 nghĩa là tệp đã không còn — coi như xoá xong.
    if (!res.ok && res.status !== 404) {
      throw new StorageTransientError(`Xoá tệp thất bại: ${res.status}`)
    }
  }

  /**
   * Liệt kê tệp trong một thư mục, mới nhất trước.
   * Dùng để dọn bản sao lưu quá hạn.
   */
  async list(
    folderPath: string,
  ): Promise<{ id: string; name: string; createdTime: string; size: number }[]> {
    const root = await this.ensureRootFolder()
    const segments = folderPath.split('/').filter(Boolean)

    let parentId = root
    for (const segment of segments) {
      const found = await this.findChildFolder(segment, parentId)
      if (!found) return [] // thư mục chưa tồn tại -> chưa có tệp nào
      parentId = found
    }

    const q = `'${parentId}' in parents and trashed = false`
    const res = await this.call(
      `${API}/files?q=${encodeURIComponent(q)}` +
        `&fields=files(id,name,createdTime,size)&orderBy=createdTime desc&pageSize=200`,
    )
    if (!res.ok) return []

    const json = (await res.json()) as {
      files: { id: string; name: string; createdTime: string; size?: string }[]
    }
    return json.files.map((f) => ({
      id: f.id,
      name: f.name,
      createdTime: f.createdTime,
      size: f.size ? Number(f.size) : 0,
    }))
  }

  async healthCheck(): Promise<{ ok: boolean; message?: string }> {
    try {
      const res = await this.call(`${API}/about?fields=user,storageQuota`)
      if (!res.ok) return { ok: false, message: `Drive trả về ${res.status}` }

      const json = (await res.json()) as {
        user?: { emailAddress?: string }
        storageQuota?: { limit?: string; usage?: string }
      }

      const quota = json.storageQuota
      const usedGb = quota?.usage ? (Number(quota.usage) / 1e9).toFixed(1) : '?'
      const limitGb = quota?.limit ? (Number(quota.limit) / 1e9).toFixed(0) : '∞'

      return {
        ok: true,
        message: `${json.user?.emailAddress ?? 'Đã kết nối'} · dùng ${usedGb}/${limitGb} GB`,
      }
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'Lỗi không xác định',
      }
    }
  }
}
