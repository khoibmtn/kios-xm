/**
 * Phân bổ giá trị gói liệu trình cho từng buổi.
 *
 * Vì sao cần: khách mua gói 5 triệu gồm 10 buổi chăm sóc da và 2 buổi laser.
 * Khi khách dùng một buổi, hoá đơn ghi 0 đồng — nhưng KTV vẫn phải được tính
 * hoa hồng, và báo cáo vẫn phải biết buổi đó "đáng giá" bao nhiêu.
 *
 * Cách sai (bản thiết kế đầu tiên của tôi): chia đều giá gói cho tổng số buổi.
 * Với ví dụ trên thì mọi buổi đều là 416.667 đ — một buổi laser giá lẻ 1,5
 * triệu bị coi ngang một buổi chăm sóc da 300 nghìn. Sai cả cho hoa hồng lẫn
 * đánh giá hiệu suất.
 *
 * Cách đúng: phân bổ **theo tỷ trọng giá bán lẻ**.
 *
 *                                    retail_i × sessions_i
 *   allocated_i = package_price × ─────────────────────────────
 *                                  Σ (retail × sessions)
 *
 * Kết quả cho ví dụ trên: chăm sóc da 250.000 đ/buổi, laser 1.250.000 đ/buổi.
 *
 * Giá trị này được **chốt lại tại thời điểm bán** (ADR-001 §1.3). Về sau bảng
 * giá có thay đổi cũng không làm xê dịch hoa hồng hay báo cáo của gói đã bán.
 */

export type AllocationMode = 'proportional_retail' | 'equal_per_session' | 'custom'

export interface PackageComponent {
  serviceId: string
  serviceName?: string
  sessions: number
  /** Buổi tặng thêm — không tính vào phân bổ giá trị. */
  bonusSessions?: number
  /** Giá bán lẻ của dịch vụ tại thời điểm cấu hình gói. */
  retailPrice: number
}

export interface AllocatedComponent extends PackageComponent {
  /** Tổng giá trị phân bổ cho dịch vụ này trong gói. */
  allocatedTotal: number
  /** Giá trị mỗi buổi — dùng làm cơ sở tính hoa hồng khi khách dùng buổi. */
  allocatedPerSession: number
  /** Tỷ trọng trong gói, để hiển thị cho người dùng hiểu vì sao ra con số đó. */
  share: number
}

export interface AllocationResult {
  mode: AllocationMode
  components: AllocatedComponent[]
  /** Tổng giá lẻ nếu mua rời — luôn ≥ giá gói, chênh lệch là phần ưu đãi. */
  retailTotal: number
  packagePrice: number
  /** Số tiền khách tiết kiệm được khi mua gói. */
  discountAmount: number
  discountRatio: number
  warnings: string[]
}

export class PackageAllocationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PackageAllocationError'
  }
}

/** Làm tròn về đồng — tiền Việt không có số lẻ. */
function roundDong(value: number): number {
  return Math.round(value)
}

export function allocatePackageValue(
  packagePrice: number,
  components: PackageComponent[],
  mode: AllocationMode = 'proportional_retail',
): AllocationResult {
  if (components.length === 0) {
    throw new PackageAllocationError('Gói phải có ít nhất một dịch vụ')
  }
  if (packagePrice < 0) {
    throw new PackageAllocationError('Giá gói không được âm')
  }
  for (const c of components) {
    if (c.sessions <= 0) {
      throw new PackageAllocationError(
        `Số buổi của "${c.serviceName ?? c.serviceId}" phải lớn hơn 0`,
      )
    }
  }

  const warnings: string[] = []

  const retailTotal = components.reduce((sum, c) => sum + c.retailPrice * c.sessions, 0)
  const totalSessions = components.reduce((sum, c) => sum + c.sessions, 0)

  // Không có giá lẻ thì không thể phân bổ theo tỷ trọng — lùi về chia đều.
  let effectiveMode = mode
  if (mode === 'proportional_retail' && retailTotal <= 0) {
    effectiveMode = 'equal_per_session'
    warnings.push(
      'Các dịch vụ trong gói chưa có giá bán lẻ nên giá trị được chia đều cho mỗi buổi. ' +
        'Nhập giá lẻ để phân bổ đúng theo giá trị từng dịch vụ.',
    )
  }

  const weights = components.map((c) =>
    effectiveMode === 'equal_per_session'
      ? c.sessions / totalSessions
      : (c.retailPrice * c.sessions) / retailTotal,
  )

  /*
   * Phân bổ rồi làm tròn từng phần sẽ làm tổng lệch vài đồng so với giá gói.
   * Dồn phần dư vào cấu phần lớn nhất để tổng luôn khớp tuyệt đối — bất biến
   * G17. Lệch một đồng trong sổ sách là thứ kế toán sẽ đi tìm cả buổi.
   */
  const raw = weights.map((w) => packagePrice * w)
  const rounded = raw.map(roundDong)
  const drift = packagePrice - rounded.reduce((a, b) => a + b, 0)

  if (drift !== 0) {
    let largest = 0
    for (let i = 1; i < rounded.length; i++) {
      if (rounded[i] > rounded[largest]) largest = i
    }
    rounded[largest] += drift
  }

  const allocated: AllocatedComponent[] = components.map((c, i) => ({
    ...c,
    allocatedTotal: rounded[i],
    // Buổi tặng thêm không mang giá trị doanh thu, nên chỉ chia cho số buổi trả tiền.
    allocatedPerSession: roundDong(rounded[i] / c.sessions),
    share: weights[i],
  }))

  const discountAmount = Math.max(0, retailTotal - packagePrice)

  if (packagePrice > retailTotal && retailTotal > 0) {
    warnings.push(
      'Giá gói đang cao hơn tổng giá bán lẻ — khách mua gói sẽ đắt hơn mua rời từng buổi.',
    )
  }

  return {
    mode: effectiveMode,
    components: allocated,
    retailTotal,
    packagePrice,
    discountAmount,
    discountRatio: retailTotal > 0 ? discountAmount / retailTotal : 0,
    warnings,
  }
}

/**
 * Kiểm tra bất biến G17: tổng giá trị phân bổ phải bằng đúng giá gói.
 * Dùng trong kiểm thử và trước khi ghi xuống cơ sở dữ liệu.
 */
export function assertAllocationBalances(result: AllocationResult): void {
  const sum = result.components.reduce((a, c) => a + c.allocatedTotal, 0)
  if (sum !== result.packagePrice) {
    throw new PackageAllocationError(
      `Tổng phân bổ ${sum} không khớp giá gói ${result.packagePrice}`,
    )
  }
}
