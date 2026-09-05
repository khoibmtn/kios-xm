import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { productSchema } from './product-schema'

/*
 * Bộ kiểm thử này sinh ra từ một lần thử thật trên bản đã triển khai: form gói
 * liệu trình không bao giờ lưu được, vì `brandId` chỉ được vẽ ra khi loại là
 * sản phẩm — với gói thì trường đó vắng mặt hẳn trong FormData, và schema đòi
 * một chuỗi. Lỗi nằm ở ô người dùng không nhìn thấy nên màn hình chỉ báo chung
 * chung "kiểm tra lại các ô được đánh dấu" mà chẳng ô nào được đánh dấu.
 *
 * Nên các ca dưới đây mô phỏng đúng thứ FormData gửi lên cho từng loại: thiếu
 * trường thì thiếu hẳn, ô trống thì là chuỗi rỗng.
 */

const SERVICE_ID = '4e914fc1-468e-4571-a8cd-430d8d7826f9'
const CATEGORY_ID = '9ae7b378-6fe6-4b60-8fd0-febde1ea5a72'

/** Đúng những gì form gửi lên cho một gói: không có brandId, không có cost. */
const packageForm = {
  kind: 'package',
  name: 'Liệu trình da mụn',
  code: '',
  categoryId: CATEGORY_ID,
  unitId: '',
  basePrice: '3.500.000',
  description: '',
  isActive: true,
  allowsSale: true,
  validityType: 'months',
  validityValue: '12',
  components: [
    { serviceId: SERVICE_ID, sessions: 6, bonusSessions: 0, retailPrice: '500000' },
  ],
}

function firstError(result: ReturnType<typeof productSchema.safeParse>) {
  if (result.success) return null
  const issue = result.error.issues[0]
  return { path: issue.path.map(String).join('.'), message: issue.message }
}

describe('Kiểm tra dữ liệu hàng hoá', () => {
  it('gói hợp lệ được chấp nhận dù thiếu hẳn các trường của loại khác', () => {
    const r = productSchema.safeParse(packageForm)
    assert.equal(firstError(r), null)
    assert.ok(r.success)
    assert.equal(r.data.basePrice, 3_500_000) // dấu chấm ngăn nghìn đã được gỡ
  })

  it('ô chọn để trống là "chưa chọn", không phải giá trị sai', () => {
    const r = productSchema.safeParse({ ...packageForm, categoryId: '', unitId: '' })
    assert.ok(r.success)
    assert.equal(r.data.categoryId, undefined)
    assert.equal(r.data.unitId, undefined)
  })

  it('hạn dùng theo tháng mà bỏ trống thì báo bằng tiếng Việt', () => {
    const r = productSchema.safeParse({ ...packageForm, validityValue: '' })
    assert.deepEqual(firstError(r), {
      path: 'validityValue',
      message: 'Chọn hạn dùng theo ngày/tháng thì phải nhập số',
    })
  })

  it('vô thời hạn thì không cần nhập số', () => {
    const { validityValue: _omitted, ...rest } = packageForm
    const r = productSchema.safeParse({ ...rest, validityType: 'unlimited' })
    assert.ok(r.success && r.data.kind === 'package')
    assert.equal(r.data.validityValue, undefined)
  })

  it('giá bán để trống không được ngầm hiểu là 0 đồng', () => {
    const r = productSchema.safeParse({ ...packageForm, basePrice: '' })
    assert.deepEqual(firstError(r), { path: 'basePrice', message: 'Chưa nhập số tiền' })
  })

  it('chuỗi numeric của Postgres không được lọt vào ô tiền', () => {
    /*
     * "500000.00" đọc thẳng từ cơ sở dữ liệu. Gỡ dấu chấm theo kiểu ngăn nghìn
     * sẽ ra 50.000.000 — sai gấp trăm lần mà màn hình vẫn hiển thị đẹp, vì
     * `Number("500000.00")` ở phía trình duyệt lại ra đúng 500.000. Đây chính
     * là lỗi đã bắt được khi thử lưu gói thật trên bản triển khai.
     */
    const r = productSchema.safeParse({
      ...packageForm,
      components: [
        { serviceId: SERVICE_ID, sessions: 6, bonusSessions: 0, retailPrice: '500000.00' },
      ],
    })
    assert.deepEqual(firstError(r), {
      path: 'components.0.retailPrice',
      message: 'Số tiền không hợp lệ',
    })
  })

  it('giá có dấu chấm ngăn nghìn được đọc đúng', () => {
    const r = productSchema.safeParse({ ...packageForm, basePrice: '12.345.678' })
    assert.ok(r.success)
    assert.equal(r.data.basePrice, 12_345_678)
  })

  it('gói rỗng bị chặn', () => {
    const r = productSchema.safeParse({ ...packageForm, components: [] })
    assert.equal(firstError(r)?.message, 'Gói phải có ít nhất một dịch vụ')
  })

  it('một dịch vụ không được xuất hiện hai lần trong gói', () => {
    const r = productSchema.safeParse({
      ...packageForm,
      components: [
        { serviceId: SERVICE_ID, sessions: 6, bonusSessions: 0, retailPrice: '500000' },
        { serviceId: SERVICE_ID, sessions: 2, bonusSessions: 0, retailPrice: '500000' },
      ],
    })
    assert.deepEqual(firstError(r), {
      path: 'components.1.serviceId',
      message: 'Dịch vụ này đã có trong gói',
    })
  })

  it('tồn kho bỏ trống vẫn là "chưa khai", không phải 0', () => {
    const r = productSchema.safeParse({
      kind: 'product',
      name: 'Kem chống nắng',
      code: '',
      categoryId: '',
      brandId: '',
      unitId: '',
      basePrice: '250000',
      cost: '',
      description: '',
      isActive: true,
      allowsSale: true,
      trackInventory: true,
      minQuantity: '',
      maxQuantity: '',
    })
    assert.ok(r.success && r.data.kind === 'product')
    assert.equal(r.data.minQuantity, undefined)
    assert.equal(r.data.maxQuantity, undefined)
    assert.equal(r.data.cost, undefined)
  })

  it('tồn tối đa nhỏ hơn tồn tối thiểu bị chặn', () => {
    const r = productSchema.safeParse({
      kind: 'product',
      name: 'Kem chống nắng',
      code: '',
      categoryId: '',
      brandId: '',
      unitId: '',
      basePrice: '250000',
      cost: '',
      description: '',
      isActive: true,
      allowsSale: true,
      trackInventory: true,
      minQuantity: '10',
      maxQuantity: '5',
    })
    assert.deepEqual(firstError(r), {
      path: 'maxQuantity',
      message: 'Tồn tối đa phải lớn hơn tồn tối thiểu',
    })
  })

  it('dịch vụ phải có thời lượng, và lỗi nói bằng tiếng Việt', () => {
    const r = productSchema.safeParse({
      kind: 'service',
      name: 'Chăm sóc da',
      code: '',
      categoryId: '',
      unitId: '',
      basePrice: '350000',
      cost: '',
      description: '',
      isActive: true,
      allowsSale: true,
      durationMinutes: '',
      materials: [],
    })
    assert.deepEqual(firstError(r), {
      path: 'durationMinutes',
      message: 'Thời lượng tối thiểu 5 phút',
    })
  })
})
