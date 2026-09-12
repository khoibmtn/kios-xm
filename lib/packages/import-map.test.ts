import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { ParseResult } from '@/lib/catalog/import-csv'
import { mapPackageHeaders, toPackageRows } from './import-map'

/**
 * Dựng `ParseResult` giả tay thay vì đọc tệp thật: bộ đọc CSV/xlsx đã có bài
 * kiểm riêng ở `lib/catalog/import-csv.test.ts`, ở đây chỉ cần đúng hình dạng
 * `{ headers, rows }` mà `toPackageRows` nhận vào.
 */
const HEADERS = [
  'Giá trị còn lại',
  'Mã thẻ dịch vụ',
  'Tên thẻ dịch vụ',
  'Khách hàng',
  'Điện thoại',
  'Nhóm khách hàng',
  'Ngày bán',
  'Hóa đơn bán',
  'Giá bán',
  'Trạng thái',
  'Tổng',
  'Đã dùng',
  'Đã trả',
  'Còn lại',
  'HSD',
  'SD gần nhất',
  'Dịch vụ trong gói',
  'Tổng SL',
  'SL đã dùng',
  'SL đã trả',
  'SL đã đặt',
  'SL còn lại',
]

/**
 * Một dòng hợp lệ điển hình, số buổi cố ý chọn để "SL còn lại" (đã trừ cả
 * SL đã đặt) khác với `remainingSessions` đúng — 10 - 3 - 0 = 7, còn cột
 * KiotViet ghi "6" (trừ thêm 1 buổi đã đặt) — dùng để bắt lỗi nếu ai đó lỡ đọc
 * nhầm cột "SL còn lại" thay vì tự tính.
 */
const BASE_VALUES: Record<string, string> = {
  'Giá trị còn lại': '2.100.000',
  'Mã thẻ dịch vụ': '',
  'Tên thẻ dịch vụ': 'Gói chăm sóc da 10 buổi',
  'Khách hàng': 'Nguyễn Thị A',
  'Điện thoại': '0901234567',
  'Nhóm khách hàng': 'Khách quen',
  'Ngày bán': '2026-01-15',
  'Hóa đơn bán': 'HD000552',
  'Giá bán': '3.000.000',
  'Trạng thái': 'Đang hoạt động',
  // 4 cột dưới đây KiotViet xuất sai thành ngày — dữ liệu rác có chủ đích,
  // để chứng minh bộ ánh xạ không được đụng vào chúng.
  Tổng: '2026-01-15',
  'Đã dùng': '2026-01-20',
  'Đã trả': '1899-12-30',
  'Còn lại': '2026-01-15',
  HSD: 'Vô thời hạn',
  'SD gần nhất': '2026-02-01',
  'Dịch vụ trong gói': 'Thay da sinh học liệu pháp BiO tái sinh làn da (Buổi)',
  'Tổng SL': '10',
  'SL đã dùng': '3',
  'SL đã trả': '0',
  'SL đã đặt': '1',
  'SL còn lại': '6',
}

let codeCounter = 0
/** Mỗi lần gọi tự sinh một mã thẻ khác nhau, trừ khi override — tránh các test
 * nhiều dòng vô tình đụng lỗi "trùng mã" ngoài ý muốn. */
function row(overrides: Partial<Record<string, string>> = {}): Record<string, string> {
  codeCounter += 1
  return {
    ...BASE_VALUES,
    'Mã thẻ dịch vụ': `C${String(codeCounter).padStart(6, '0')}`,
    ...overrides,
  }
}

function buildParseResult(rowsValues: Record<string, string>[]): ParseResult {
  return {
    headers: HEADERS,
    rows: rowsValues.map((values, i) => ({ line: i + 2, values })),
  }
}

describe('Ánh xạ tệp thẻ dịch vụ (gói) của KiotViet', () => {
  it('đọc đúng một dòng đầy đủ', () => {
    const parsed = buildParseResult([row({ 'Mã thẻ dịch vụ': 'C000020' })])
    const { rows, problems } = toPackageRows(parsed)

    assert.equal(problems.length, 0)
    assert.equal(rows.length, 1)
    assert.deepEqual(rows[0], {
      line: 2,
      code: 'C000020',
      packageName: 'Gói chăm sóc da 10 buổi',
      customerName: 'Nguyễn Thị A',
      customerPhone: '0901234567',
      soldAt: '2026-01-15',
      invoiceCode: 'HD000552',
      price: '3000000',
      serviceName: 'Thay da sinh học liệu pháp BiO tái sinh làn da',
      totalSessions: 10,
      usedSessions: 3,
      returnedSessions: 0,
      reservedSessions: 1,
      remainingSessions: 7,
      lastUsedAt: '2026-02-01',
      expiresAt: '',
    })
  })

  it('hậu tố đơn vị "(Buổi)" và "(Lần)" bị cắt khỏi tên dịch vụ', () => {
    const parsed = buildParseResult([
      row({ 'Dịch vụ trong gói': 'Chăm sóc da chuyên sâu (Buổi)' }),
      row({ 'Dịch vụ trong gói': 'Triệt lông vĩnh viễn (Lần)' }),
    ])
    const { rows } = toPackageRows(parsed)
    assert.equal(rows[0].serviceName, 'Chăm sóc da chuyên sâu')
    assert.equal(rows[1].serviceName, 'Triệt lông vĩnh viễn')
  })

  it('tên dịch vụ có ngoặc ở giữa không bị cắt nhầm', () => {
    const parsed = buildParseResult([row({ 'Dịch vụ trong gói': 'Meso (HA) cấp ẩm (Lần)' })])
    const { rows } = toPackageRows(parsed)
    assert.equal(rows[0].serviceName, 'Meso (HA) cấp ẩm')
  })

  it('remainingSessions tính đúng và không bị trừ SL đã đặt', () => {
    const parsed = buildParseResult([
      row({
        'Tổng SL': '10',
        'SL đã dùng': '3',
        'SL đã trả': '0',
        'SL đã đặt': '1',
        // KiotViet trừ luôn phần đã đặt vào đây — cố tình để khác kết quả
        // đúng (7), chứng minh remainingSessions không lấy từ cột này.
        'SL còn lại': '6',
      }),
    ])
    const { rows } = toPackageRows(parsed)
    assert.equal(rows[0].reservedSessions, 1)
    assert.equal(rows[0].remainingSessions, 7)
  })

  it('HSD = "Vô thời hạn" thì expiresAt là chuỗi rỗng', () => {
    const parsed = buildParseResult([row({ HSD: 'Vô thời hạn' })])
    assert.equal(toPackageRows(parsed).rows[0].expiresAt, '')
  })

  it('HSD là ngày hợp lệ thì trả về đúng YYYY-MM-DD', () => {
    const parsed = buildParseResult([row({ HSD: '2027-06-30' })])
    assert.equal(toPackageRows(parsed).rows[0].expiresAt, '2027-06-30')
  })

  it('usedSessions + returnedSessions vượt quá totalSessions bị đưa vào problems', () => {
    const parsed = buildParseResult([row({ 'Tổng SL': '5', 'SL đã dùng': '4', 'SL đã trả': '2' })])
    const { rows, problems } = toPackageRows(parsed)
    assert.equal(rows.length, 0)
    assert.equal(problems.length, 1)
    assert.match(problems[0].message, /mâu thuẫn/)
  })

  it('"Tổng SL" không phải số nguyên dương bị đưa vào problems', () => {
    const parsed = buildParseResult([row({ 'Tổng SL': '0' }), row({ 'Tổng SL': 'abc' })])
    const { rows, problems } = toPackageRows(parsed)
    assert.equal(rows.length, 0)
    assert.equal(problems.length, 2)
    assert.match(problems[0].message, /Tổng SL/)
  })

  it('mã thẻ trùng trong tệp bị đưa vào problems, không phân biệt hoa thường', () => {
    const parsed = buildParseResult([
      row({ 'Mã thẻ dịch vụ': 'C000020' }),
      row({ 'Mã thẻ dịch vụ': 'c000020', 'Khách hàng': 'Người khác' }),
    ])
    const { rows, problems } = toPackageRows(parsed)
    assert.equal(rows.length, 1)
    assert.equal(problems.length, 1)
    assert.equal(problems[0].line, 3)
    assert.match(problems[0].message, /hai lần trong tệp/)
  })

  it('thiếu mã thẻ, tên khách, tên gói, hoặc dịch vụ trong gói thì loại dòng', () => {
    const parsed = buildParseResult([
      row({ 'Mã thẻ dịch vụ': '' }),
      row({ 'Khách hàng': '' }),
      row({ 'Tên thẻ dịch vụ': '' }),
      row({ 'Dịch vụ trong gói': '' }),
    ])
    const { rows, problems } = toPackageRows(parsed)
    assert.equal(rows.length, 0)
    assert.deepEqual(
      problems.map((p) => p.message),
      [
        'Thiếu mã thẻ dịch vụ',
        'Thiếu tên khách hàng',
        'Thiếu tên thẻ dịch vụ',
        'Thiếu dịch vụ trong gói',
      ],
    )
  })

  it('báo thiếu cột bắt buộc thay vì nhập nửa vời', () => {
    const parsed: ParseResult = { headers: ['Khách hàng'], rows: [] }
    const plan = toPackageRows(parsed)
    assert.deepEqual(plan.missingColumns.sort(), ['code', 'packageName', 'serviceName'])
    assert.equal(plan.rows.length, 0)
  })

  it('các cột bị bỏ qua xuất hiện đủ trong ignoredColumns', () => {
    const parsed = buildParseResult([row()])
    const plan = toPackageRows(parsed)
    assert.deepEqual(plan.ignoredColumns, [
      'Giá trị còn lại',
      'Nhóm khách hàng',
      'Trạng thái',
      'Tổng',
      'Đã dùng',
      'Đã trả',
      'Còn lại',
      'SL còn lại',
    ])
    assert.deepEqual(plan.usedColumns.map((c) => c.field).sort(), [
      'code',
      'customerName',
      'customerPhone',
      'expiresAt',
      'invoiceCode',
      'lastUsedAt',
      'packageName',
      'price',
      'reservedSessions',
      'returnedSessions',
      'serviceName',
      'soldAt',
      'totalSessions',
      'usedSessions',
    ])
  })

  it('nhận diện đúng tên cột dù không dấu', () => {
    const m = mapPackageHeaders([
      'ma the dich vu',
      'ten the dich vu',
      'khach hang',
      'dich vu trong goi',
    ])
    assert.equal(m.code, 'ma the dich vu')
    assert.equal(m.packageName, 'ten the dich vu')
    assert.equal(m.customerName, 'khach hang')
    assert.equal(m.serviceName, 'dich vu trong goi')
  })
  it('giá "500000.00" không bị hiểu thành 50 triệu', () => {
    // Dấu chấm ngăn nghìn của người Việt luôn đủ ba chữ số; hai chữ số sau dấu
    // chấm là phần thập phân Excel sinh ra khi lưu sang CSV.
    const { rows } = toPackageRows(buildParseResult([row({ 'Giá bán': '500000.00' })]))
    assert.equal(rows[0].price, '500000')
  })

  it('giá "1.234.567" vẫn đọc đúng thành 1234567', () => {
    const { rows } = toPackageRows(buildParseResult([row({ 'Giá bán': '1.234.567' })]))
    assert.equal(rows[0].price, '1234567')
  })

  it('đọc được ngày dạng dd/MM/yyyy — bản xuất thẻ dịch vụ ghi kiểu này', () => {
    const { rows } = toPackageRows(
      buildParseResult([row({ 'Ngày bán': '20/07/2026', 'SD gần nhất': '6/9/2026' })]),
    )
    assert.equal(rows[0].soldAt, '2026-07-20')
    assert.equal(rows[0].lastUsedAt, '2026-09-06')
  })

  it('dòng không đọc được ngày bán bị bỏ qua thay vì làm đổ câu chèn', () => {
    const plan = toPackageRows(buildParseResult([row({ 'Ngày bán': 'không rõ' })]))
    assert.equal(plan.rows.length, 0)
    assert.match(plan.problems[0].message, /ngày bán/)
  })
})
