/**
 * Lớp trừu tượng cho lưu trữ tệp.
 *
 * Nghiệp vụ KHÔNG bao giờ gọi Google Drive API trực tiếp — chỉ đi qua giao
 * diện này. Nhờ vậy đổi sang Cloudflare R2 hay S3 về sau chỉ là đổi biến môi
 * trường + chạy script chuyển tệp, không phải sửa mã nghiệp vụ (ADR-002 §2.5).
 */

export interface StoredFileMeta {
  /** Mã tệp phía nhà cung cấp (fileId của Drive, key của R2…). */
  externalId: string
  path: string
  mime: string
  size: number
  checksum?: string
}

export interface PutOptions {
  path: string
  data: Uint8Array | ArrayBuffer
  mime: string
  /** Ghi đè nếu đã có tệp cùng đường dẫn. */
  overwrite?: boolean
}

export interface StorageAdapter {
  readonly provider: string

  /** Tải tệp lên, trả về siêu dữ liệu để ghi vào bảng `files`. */
  put(options: PutOptions): Promise<StoredFileMeta>

  /** Lấy nội dung tệp. Dùng cho endpoint có kiểm tra quyền. */
  get(externalId: string): Promise<{ data: ArrayBuffer; mime: string }>

  delete(externalId: string): Promise<void>

  /** Kiểm tra kết nối còn sống (token chưa hết hạn). */
  healthCheck(): Promise<{ ok: boolean; message?: string }>
}

/** Lỗi cần người dùng kết nối lại nhà cung cấp lưu trữ. */
export class StorageAuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StorageAuthError'
  }
}

/** Lỗi tạm thời — đáng thử lại. */
export class StorageTransientError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StorageTransientError'
  }
}
