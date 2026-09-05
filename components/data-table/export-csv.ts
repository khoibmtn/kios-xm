/**
 * Xuất bảng ra CSV mở được bằng Excel tiếng Việt.
 *
 * Hai điểm dễ sai nếu tự viết:
 *  - Excel bản Việt hoá dùng dấu chấm phẩy làm dấu phân cách, không phải dấu phẩy.
 *  - Thiếu BOM thì tiếng Việt có dấu hiển thị thành ký tự lạ.
 */

export interface ExportColumn<T> {
  header: string
  value: (row: T) => string | number | null | undefined
}

function escapeCell(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined) return ''
  const s = String(raw)
  // Excel diễn giải ô bắt đầu bằng = + - @ là công thức -> chèn nháy đơn chặn lại.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s
  return /[";\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export function buildCsv<T>(rows: T[], columns: ExportColumn<T>[]): string {
  const header = columns.map((c) => escapeCell(c.header)).join(';')
  const body = rows
    .map((row) => columns.map((c) => escapeCell(c.value(row))).join(';'))
    .join('\r\n')
  return `${header}\r\n${body}`
}

export function downloadCsv<T>(
  fileName: string,
  rows: T[],
  columns: ExportColumn<T>[],
): void {
  const csv = buildCsv(rows, columns)
  // ﻿ = BOM, để Excel nhận đúng UTF-8
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' })

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName.endsWith('.csv') ? fileName : `${fileName}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/** Tên tệp kèm ngày để không ghi đè lần xuất trước. */
export function exportFileName(prefix: string): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${prefix}_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
}
