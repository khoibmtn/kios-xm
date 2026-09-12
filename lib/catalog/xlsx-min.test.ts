import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parseSheetXml, parseSharedStrings } from './xlsx-min'

/*
 * Chỉ kiểm phần XML → lưới ô. Phần giải nén ZIP cần tệp nhị phân thật, mà tệp
 * thật là dữ liệu kinh doanh của spa nên không nằm trong repo; nó được đối
 * chiếu tay với bốn bản xuất KiotViet (xem `PROGRESS.md` 07/09).
 *
 * Các mẫu XML dưới đây chép đúng hình dạng KiotViet sinh ra, không phải XML
 * do tôi tưởng tượng — đó là điểm khiến bài kiểm này có giá trị.
 */

describe('Bộ đọc .xlsx tối giản', () => {
  it('đọc phương ngữ KiotViet: thẻ có tiền tố x:, chuỗi thẳng trong <x:v>, không toạ độ', () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?><x:worksheet xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><x:sheetData><x:row><x:c s="1" t="str"><x:v>Mã hàng</x:v></x:c><x:c s="1" t="str"><x:v>Giá vốn</x:v></x:c></x:row><x:row><x:c s="6" t="str"><x:v>SP000244</x:v></x:c><x:c s="4" t="n"><x:v>1994850.00</x:v></x:c></x:row></x:sheetData></x:worksheet>`

    assert.deepEqual(parseSheetXml(xml), [
      ['Mã hàng', 'Giá vốn'],
      ['SP000244', 1994850],
    ])
  })

  it('ô rỗng tự đóng vẫn giữ chỗ, không làm lệch các cột sau', () => {
    const xml = `<x:row><x:c t="str"><x:v>A</x:v></x:c><x:c s="6"/><x:c t="str"><x:v>C</x:v></x:c></x:row>`
    assert.deepEqual(parseSheetXml(xml), [['A', null, 'C']])
  })

  it('tiền ghi "6000000.0000" ra số 6000000, không phải chuỗi', () => {
    // Để nguyên chuỗi thì bộ chuẩn hoá tiền tệ gỡ dấu chấm và biến 6 triệu
    // thành 60 tỉ — đúng lỗi đã suýt xảy ra hôm 05/09.
    const xml = `<x:row><x:c t="n"><x:v>6000000.0000</x:v></x:c></x:row>`
    const [[value]] = parseSheetXml(xml)
    assert.equal(value, 6000000)
    assert.equal(typeof value, 'number')
    assert.equal(String(value), '6000000')
  })

  it('phương ngữ chuẩn: thẻ không tiền tố, chuỗi lấy từ bảng dùng chung', () => {
    const shared = parseSharedStrings(
      `<sst><si><t>Tên khách</t></si><si><t>Chị Vi Xen</t></si></sst>`,
    )
    const xml = `<row r="1"><c r="A1" t="s"><v>0</v></c></row><row r="2"><c r="A2" t="s"><v>1</v></c></row>`
    assert.deepEqual(parseSheetXml(xml, shared), [['Tên khách'], ['Chị Vi Xen']])
  })

  it('ô bị bỏ qua ở phương ngữ chuẩn được đệm theo toạ độ r', () => {
    // Phương ngữ chuẩn bỏ hẳn ô rỗng; không đệm thì cột C nhảy về vị trí B.
    const xml = `<row r="1"><c r="A1" t="str"><v>A</v></c><c r="C1" t="str"><v>C</v></c></row>`
    assert.deepEqual(parseSheetXml(xml), [['A', null, 'C']])
  })

  it('giải mã được ký tự viết tắt XML', () => {
    const xml = `<x:row><x:c t="str"><x:v>Gói A &amp; B &lt;3&gt; &quot;x&quot; &#39;y&#39; &#x41;</x:v></x:c></x:row>`
    assert.deepEqual(parseSheetXml(xml), [[`Gói A & B <3> "x" 'y' A`]])
  })

  it('chuỗi nội tuyến nhiều đoạn được nối lại', () => {
    const xml = `<x:row><x:c t="inlineStr"><x:is><x:t>Liệu </x:t><x:t>trình</x:t></x:is></x:c></x:row>`
    assert.deepEqual(parseSheetXml(xml), [['Liệu trình']])
  })

  it('ô lỗi của Excel coi như trống thay vì đổ', () => {
    const xml = `<x:row><x:c t="e"><x:v>#REF!</x:v></x:c><x:c t="str"><x:v>sau</x:v></x:c></x:row>`
    assert.deepEqual(parseSheetXml(xml), [[null, 'sau']])
  })

  it('dòng trống bị bỏ qua ở phương ngữ chuẩn được đệm theo r', () => {
    const xml = `<row r="1"><c t="str"><v>A</v></c></row><row r="3"><c t="str"><v>C</v></c></row>`
    assert.deepEqual(parseSheetXml(xml), [['A'], [], ['C']])
  })
})
