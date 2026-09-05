import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  allocatePackageValue,
  assertAllocationBalances,
  PackageAllocationError,
} from './package-allocation'

describe('Phân bổ giá trị gói liệu trình', () => {
  it('gói một loại dịch vụ thì chia đều', () => {
    // 10 buổi Meso, gói 6 triệu -> mỗi buổi 600 nghìn
    const r = allocatePackageValue(6_000_000, [
      { serviceId: 'meso', sessions: 10, retailPrice: 800_000 },
    ])

    assert.equal(r.components[0].allocatedPerSession, 600_000)
    assert.equal(r.components[0].allocatedTotal, 6_000_000)
    assert.equal(r.discountAmount, 2_000_000) // giá lẻ 8tr, gói 6tr
    assertAllocationBalances(r)
  })

  it('gói nhiều loại thì phân bổ theo tỷ trọng giá lẻ, không chia đều', () => {
    /*
     * Chính là ví dụ đã làm lộ ra lỗi trong bản thiết kế đầu (ADR-001 §1.3):
     *   10 buổi chăm sóc da, giá lẻ 300k -> 3.000.000
     *    2 buổi laser,       giá lẻ 1,5tr -> 3.000.000
     *   tổng giá lẻ 6.000.000, giá gói 5.000.000
     *
     * Chia đều sẽ ra 416.667/buổi cho cả hai — coi buổi laser 1,5 triệu ngang
     * buổi chăm sóc da 300 nghìn. Phân bổ theo tỷ trọng mới đúng.
     */
    const r = allocatePackageValue(5_000_000, [
      { serviceId: 'cham-soc-da', serviceName: 'Chăm sóc da', sessions: 10, retailPrice: 300_000 },
      { serviceId: 'laser', serviceName: 'Laser', sessions: 2, retailPrice: 1_500_000 },
    ])

    const [skin, laser] = r.components
    assert.equal(skin.allocatedTotal, 2_500_000)
    assert.equal(skin.allocatedPerSession, 250_000)
    assert.equal(laser.allocatedTotal, 2_500_000)
    assert.equal(laser.allocatedPerSession, 1_250_000)

    // Buổi laser phải đáng giá gấp 5 lần buổi chăm sóc da, đúng tỷ lệ giá lẻ
    assert.equal(laser.allocatedPerSession / skin.allocatedPerSession, 5)
    assertAllocationBalances(r)
  })

  it('tổng phân bổ luôn khớp giá gói dù có số lẻ khi làm tròn', () => {
    // Ba cấu phần với trọng số lẻ -> chia xong sẽ dư vài đồng
    const r = allocatePackageValue(10_000_000, [
      { serviceId: 'a', sessions: 3, retailPrice: 333_333 },
      { serviceId: 'b', sessions: 7, retailPrice: 111_111 },
      { serviceId: 'c', sessions: 11, retailPrice: 77_777 },
    ])

    const sum = r.components.reduce((a, c) => a + c.allocatedTotal, 0)
    assert.equal(sum, 10_000_000, 'phần dư do làm tròn phải được dồn lại')
    assertAllocationBalances(r)
  })

  it('thiếu giá bán lẻ thì lùi về chia đều và cảnh báo', () => {
    const r = allocatePackageValue(3_000_000, [
      { serviceId: 'a', sessions: 2, retailPrice: 0 },
      { serviceId: 'b', sessions: 4, retailPrice: 0 },
    ])

    assert.equal(r.mode, 'equal_per_session')
    assert.equal(r.components[0].allocatedTotal, 1_000_000) // 2/6
    assert.equal(r.components[1].allocatedTotal, 2_000_000) // 4/6
    assert.match(r.warnings[0], /chưa có giá bán lẻ/)
    assertAllocationBalances(r)
  })

  it('buổi tặng thêm không làm tăng giá trị phân bổ', () => {
    // Trả tiền 10 buổi, tặng 2 -> giá trị vẫn chia cho 10 buổi trả tiền
    const r = allocatePackageValue(5_000_000, [
      { serviceId: 'a', sessions: 10, bonusSessions: 2, retailPrice: 600_000 },
    ])

    assert.equal(r.components[0].allocatedPerSession, 500_000)
    assert.equal(r.components[0].allocatedTotal, 5_000_000)
  })

  it('cảnh báo khi giá gói đắt hơn mua rời', () => {
    const r = allocatePackageValue(9_000_000, [
      { serviceId: 'a', sessions: 10, retailPrice: 800_000 },
    ])

    assert.equal(r.discountAmount, 0)
    assert.match(r.warnings[0], /cao hơn tổng giá bán lẻ/)
  })

  it('từ chối dữ liệu vô nghĩa', () => {
    assert.throws(() => allocatePackageValue(1_000_000, []), PackageAllocationError)
    assert.throws(
      () => allocatePackageValue(-1, [{ serviceId: 'a', sessions: 1, retailPrice: 1 }]),
      PackageAllocationError,
    )
    assert.throws(
      () => allocatePackageValue(1_000_000, [{ serviceId: 'a', sessions: 0, retailPrice: 1 }]),
      PackageAllocationError,
    )
  })
})
