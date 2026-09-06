import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mapHeaders, normaliseMoney, parseCsv, parseKind, toImportRows } from './import-csv'

describe('Đọc tệp CSV hàng hoá', () => {
  it('nhận dấu chấm phẩy — Excel bản tiếng Việt xuất ra như vậy', () => {
    const r = parseCsv('Mã hàng;Tên hàng;Loại;Giá bán\nDV0001;Chăm sóc da;Dịch vụ;500.000')
    assert.deepEqual(r.headers, ['Mã hàng', 'Tên hàng', 'Loại', 'Giá bán'])
    assert.equal(r.rows.length, 1)
    assert.equal(r.rows[0].values['Tên hàng'], 'Chăm sóc da')
  })

  it('nhận cả dấu phẩy khi tệp không có chấm phẩy nào', () => {
    const r = parseCsv('Tên hàng,Loại,Giá bán\nChăm sóc da,Dịch vụ,500000')
    assert.equal(r.rows[0].values['Giá bán'], '500000')
  })

  it('gỡ BOM, nếu không thì cột đầu tiên không bao giờ khớp', () => {
    const r = parseCsv('﻿Mã hàng;Tên hàng\nSP01;Kem')
    assert.equal(r.headers[0], 'Mã hàng')
    assert.equal(mapHeaders(r.headers).code, 'Mã hàng')
  })

  it('ô có dấu nháy giữ nguyên dấu phân cách bên trong', () => {
    const r = parseCsv('Tên hàng;Mô tả\n"Chăm sóc da mụn; phục hồi";"Gồm 2 bước"')
    assert.equal(r.rows[0].values['Tên hàng'], 'Chăm sóc da mụn; phục hồi')
  })

  it('hai dấu nháy liền là một dấu nháy trong nội dung', () => {
    const r = parseCsv('Tên hàng\n"Kem ""Snow White"" 50g"')
    assert.equal(r.rows[0].values['Tên hàng'], 'Kem "Snow White" 50g')
  })

  it('bỏ qua dòng trống Excel để lại ở cuối tệp', () => {
    const r = parseCsv('Tên hàng;Loại\nKem;Sản phẩm\n;\n\n')
    assert.equal(r.rows.length, 1)
  })

  it('nhận nhiều cách gọi tên cột, kể cả của KiotViet', () => {
    const m = mapHeaders(['Mã hàng hóa', 'Tên hàng hóa', 'ĐVT', 'Nhóm hàng'])
    assert.equal(m.code, 'Mã hàng hóa')
    assert.equal(m.name, 'Tên hàng hóa')
    assert.equal(m.unitName, 'ĐVT')
    assert.equal(m.categoryName, 'Nhóm hàng')
  })

  it('đọc được loại hàng viết theo nhiều kiểu', () => {
    assert.equal(parseKind('Dịch vụ'), 'service')
    assert.equal(parseKind('  GÓI DỊCH VỤ '), 'package')
    assert.equal(parseKind('Liệu trình'), 'package')
    assert.equal(parseKind('Thẻ tài khoản'), 'card')
    assert.equal(parseKind('Sản phẩm'), 'product')
    assert.equal(parseKind('Combo'), null)
  })

  it('gỡ dấu chấm ngăn nghìn khỏi tiền', () => {
    assert.equal(normaliseMoney('1.500.000'), '1500000')
    assert.equal(normaliseMoney('500000'), '500000')
    assert.equal(normaliseMoney(''), '')
  })

  it('báo thiếu cột bắt buộc thay vì nhập nửa vời', () => {
    const result = toImportRows(parseCsv('Mã hàng;Nhóm hàng\nSP01;Mỹ phẩm'))
    assert.deepEqual(result.missingColumns, ['name', 'kind', 'basePrice'])
    assert.equal(result.rows.length, 0)
  })

  it('loại dòng hỏng và nói rõ dòng nào, vì sao', () => {
    const csv = [
      'Mã hàng;Tên hàng;Loại;Giá bán',
      'SP01;Kem chống nắng;Sản phẩm;260.000',
      'SP02;;Sản phẩm;100.000',
      'SP03;Combo lạ;Combo;100.000',
      'SP01;Trùng mã;Sản phẩm;120.000',
    ].join('\n')

    const { rows, problems } = toImportRows(parseCsv(csv))

    assert.equal(rows.length, 1)
    assert.equal(rows[0].basePrice, '260000')
    assert.deepEqual(
      problems.map((p) => p.line),
      [3, 4, 5],
    )
    assert.match(problems[0].message, /Thiếu tên hàng/)
    assert.match(problems[1].message, /Không hiểu loại hàng/)
    assert.match(problems[2].message, /hai lần trong tệp/)
  })

  it('trạng thái "Ngừng bán" tắt hàng hoá, thiếu cột thì mặc định đang bán', () => {
    const csv = [
      'Tên hàng;Loại;Giá bán;Trạng thái',
      'Kem A;Sản phẩm;100000;Đang bán',
      'Kem B;Sản phẩm;100000;Ngừng bán',
    ].join('\n')
    const { rows } = toImportRows(parseCsv(csv))
    assert.equal(rows[0].isActive, true)
    assert.equal(rows[1].isActive, false)

    const { rows: noStatus } = toImportRows(parseCsv('Tên hàng;Loại;Giá bán\nKem C;Sản phẩm;1000'))
    assert.equal(noStatus[0].isActive, true)
  })
})
