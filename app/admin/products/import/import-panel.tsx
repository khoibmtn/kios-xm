'use client'

import { useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle, CheckCircle2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/data-table/filters'
import { KIND_LABEL } from '@/lib/catalog/labels'
import { formatMoney } from '@/lib/format'
import { parseCsv, toImportRows, type ImportRow, type RowProblem } from '@/lib/catalog/import-csv'
import { importProductsAction, type ImportOutcome } from './actions'

/** Ghi mỗi lần 50 dòng: đủ nhanh mà không chạm giới hạn thời gian của Worker. */
const BATCH_SIZE = 50

const REQUIRED_LABEL: Record<string, string> = {
  name: 'Tên hàng',
  kind: 'Loại',
  basePrice: 'Giá bán',
}

export function ImportPanel() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)

  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState<ImportRow[]>([])
  const [problems, setProblems] = useState<RowProblem[]>([])
  const [missingColumns, setMissingColumns] = useState<string[]>([])
  const [fileError, setFileError] = useState('')
  const [outcomes, setOutcomes] = useState<ImportOutcome[] | null>(null)
  const [progress, setProgress] = useState(0)
  const [pending, startTransition] = useTransition()

  const reset = () => {
    setRows([])
    setProblems([])
    setMissingColumns([])
    setFileError('')
    setOutcomes(null)
    setProgress(0)
  }

  const onFile = async (file: File) => {
    reset()
    setFileName(file.name)

    if (/\.xlsx?$/i.test(file.name)) {
      setFileError(
        'Tệp Excel (.xlsx) chưa đọc được. Trong Excel chọn Lưu thành / Save As → CSV UTF-8 rồi tải lên lại.',
      )
      return
    }

    const text = await file.text()
    const parsed = parseCsv(text)
    if (parsed.error) {
      setFileError(parsed.error)
      return
    }

    const result = toImportRows(parsed)
    setMissingColumns(result.missingColumns)
    setRows(result.rows)
    setProblems(result.problems)
  }

  const run = () => {
    startTransition(async () => {
      const all: ImportOutcome[] = []

      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE)
        const result = await importProductsAction(batch)

        if (result.error) {
          setFileError(result.error)
          break
        }
        all.push(...result.outcomes)
        setProgress(Math.min(i + BATCH_SIZE, rows.length))
      }

      setOutcomes(all)
      router.refresh()
    })
  }

  const created = outcomes?.filter((o) => o.status === 'created').length ?? 0
  const updated = outcomes?.filter((o) => o.status === 'updated').length ?? 0
  const failed = outcomes?.filter((o) => o.status === 'failed') ?? []

  return (
    <div className="space-y-4">
      <section className="border-border bg-card space-y-3 rounded-lg border p-5">
        <h2 className="font-semibold">1. Chọn tệp</h2>
        <p className="text-muted-foreground text-sm">
          Tệp CSV, mỗi dòng một hàng hoá. Bắt buộc có ba cột{' '}
          <strong className="text-foreground font-medium">Tên hàng</strong>,{' '}
          <strong className="text-foreground font-medium">Loại</strong>,{' '}
          <strong className="text-foreground font-medium">Giá bán</strong>. Các cột khác
          (Mã hàng, Nhóm hàng, Thương hiệu, Đơn vị, Giá vốn, Thời lượng, Mệnh giá) có thì
          dùng, không có cũng được.
        </p>
        <p className="text-muted-foreground text-sm">
          Nhóm hàng, thương hiệu và đơn vị tính chưa có sẽ được tạo theo đúng tên trong tệp.
          Dòng nào có mã trùng hàng hoá sẵn có thì được cập nhật, không tạo thêm bản sao.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv,.xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void onFile(file)
            }}
          />
          <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={pending}>
            <Upload className="size-4" /> Chọn tệp CSV
          </Button>
          {fileName && <span className="text-muted-foreground text-sm">{fileName}</span>}
        </div>

        {fileError && (
          <p role="alert" className="text-danger bg-danger/10 rounded-md px-4 py-3 text-sm">
            {fileError}
          </p>
        )}

        {missingColumns.length > 0 && (
          <p role="alert" className="text-danger bg-danger/10 rounded-md px-4 py-3 text-sm">
            Tệp thiếu cột bắt buộc: {missingColumns.map((c) => REQUIRED_LABEL[c]).join(', ')}.
          </p>
        )}
      </section>

      {rows.length > 0 && !outcomes && (
        <>
          <section className="border-border bg-card rounded-lg border p-5">
            <h2 className="font-semibold">2. Xem trước</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Đọc được <strong className="text-foreground">{rows.length}</strong> dòng
              {problems.length > 0 && (
                <>
                  , bỏ qua <strong className="text-warning">{problems.length}</strong> dòng
                </>
              )}
              . Chưa có gì được ghi vào cơ sở dữ liệu.
            </p>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/60 text-muted-foreground text-left">
                  <tr>
                    <th className="px-3 py-2 font-medium">Dòng</th>
                    <th className="px-3 py-2 font-medium">Mã</th>
                    <th className="px-3 py-2 font-medium">Tên hàng</th>
                    <th className="px-3 py-2 font-medium">Loại</th>
                    <th className="px-3 py-2 text-right font-medium">Giá bán</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 20).map((r) => (
                    <tr key={r.line} className="border-border border-b last:border-0">
                      <td className="text-muted-foreground tabular px-3 py-2">{r.line}</td>
                      <td className="tabular px-3 py-2">{r.code || '—'}</td>
                      <td className="px-3 py-2">{r.name}</td>
                      <td className="px-3 py-2">{KIND_LABEL[r.kind]}</td>
                      <td className="tabular px-3 py-2 text-right">{formatMoney(r.basePrice)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 20 && (
                <p className="text-muted-foreground mt-2 text-xs">
                  … và {rows.length - 20} dòng nữa.
                </p>
              )}
            </div>
          </section>

          {problems.length > 0 && (
            <section className="border-warning/40 bg-warning/5 rounded-lg border p-5">
              <h2 className="text-warning flex items-center gap-2 font-semibold">
                <AlertTriangle className="size-4" />
                {problems.length} dòng sẽ bị bỏ qua
              </h2>
              <ul className="mt-3 space-y-1 text-sm">
                {problems.slice(0, 15).map((p) => (
                  <li key={p.line}>
                    <span className="text-muted-foreground tabular">Dòng {p.line}:</span>{' '}
                    {p.message}
                  </li>
                ))}
              </ul>
              {problems.length > 15 && (
                <p className="text-muted-foreground mt-2 text-xs">
                  … và {problems.length - 15} dòng nữa.
                </p>
              )}
            </section>
          )}

          <div className="flex items-center gap-3">
            <Button onClick={run} disabled={pending}>
              {pending ? `Đang ghi ${progress}/${rows.length}…` : `Nhập ${rows.length} hàng hoá`}
            </Button>
            <Button variant="outline" onClick={reset} disabled={pending}>
              Chọn tệp khác
            </Button>
          </div>
        </>
      )}

      {outcomes && (
        <section className="border-border bg-card space-y-4 rounded-lg border p-5">
          <h2 className="flex items-center gap-2 font-semibold">
            <CheckCircle2 className="text-success size-5" /> Đã nhập xong
          </h2>

          <div className="flex flex-wrap gap-2">
            <Badge tone="success">{created} thêm mới</Badge>
            {updated > 0 && <Badge>{updated} cập nhật</Badge>}
            {failed.length > 0 && <Badge tone="danger">{failed.length} lỗi</Badge>}
          </div>

          {failed.length > 0 && (
            <ul className="space-y-1 text-sm">
              {failed.map((o) => (
                <li key={o.line}>
                  <span className="text-muted-foreground tabular">Dòng {o.line}</span>{' '}
                  <strong className="font-medium">{o.name}</strong> — {o.message}
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-center gap-3">
            <Link href="/admin/products">
              <Button>Xem danh sách hàng hoá</Button>
            </Link>
            <Button variant="outline" onClick={reset}>
              Nhập tệp khác
            </Button>
          </div>
        </section>
      )}
    </div>
  )
}
