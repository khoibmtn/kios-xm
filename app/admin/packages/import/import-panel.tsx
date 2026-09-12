'use client'

import { useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle, CheckCircle2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/data-table/filters'
import { formatMoney } from '@/lib/format'
import { readImportFile } from '@/lib/catalog/import-file'
import {
  PACKAGE_FIELD_LABEL,
  toPackageRows,
  type PackageImportPlan,
  type PackageImportRow,
} from '@/lib/packages/import-map'
import { importPackagesAction, type PackageImportOutcome } from './actions'

const BATCH_SIZE = 50

export function PackageImportPanel() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)

  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState<PackageImportRow[]>([])
  const [problems, setProblems] = useState<PackageImportPlan['problems']>([])
  const [missing, setMissing] = useState<string[]>([])
  const [columns, setColumns] = useState<Pick<
    PackageImportPlan,
    'usedColumns' | 'ignoredColumns'
  > | null>(null)
  const [fileError, setFileError] = useState('')
  const [outcomes, setOutcomes] = useState<PackageImportOutcome[] | null>(null)
  const [progress, setProgress] = useState(0)
  const [reading, setReading] = useState(false)
  const [pending, startTransition] = useTransition()

  const reset = () => {
    setRows([])
    setProblems([])
    setMissing([])
    setColumns(null)
    setFileError('')
    setOutcomes(null)
    setProgress(0)
  }

  const onFile = async (file: File) => {
    reset()
    setFileName(file.name)
    setReading(true)
    try {
      const parsed = await readImportFile(file)
      if (parsed.error) {
        setFileError(parsed.error)
        return
      }
      const plan = toPackageRows(parsed)
      setMissing(plan.missingColumns)
      setRows(plan.rows)
      setProblems(plan.problems)
      setColumns({ usedColumns: plan.usedColumns, ignoredColumns: plan.ignoredColumns })
    } finally {
      setReading(false)
    }
  }

  const run = () => {
    startTransition(async () => {
      const all: PackageImportOutcome[] = []
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const result = await importPackagesAction(rows.slice(i, i + BATCH_SIZE))
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
  const skipped = outcomes?.filter((o) => o.status === 'skipped').length ?? 0
  const failed = outcomes?.filter((o) => o.status === 'failed') ?? []

  const owed = rows.reduce((s, r) => s + r.remainingSessions, 0)
  const reserved = rows.reduce((s, r) => s + r.reservedSessions, 0)

  return (
    <div className="space-y-4">
      <section className="border-border bg-card space-y-3 rounded-lg border p-5">
        <h2 className="font-semibold">1. Chọn tệp</h2>
        <p className="text-muted-foreground text-sm">
          Bản xuất <strong className="text-foreground font-medium">Thẻ dịch vụ</strong> từ KiotViet
          (.xlsx hoặc CSV) dùng thẳng được. Khách và dịch vụ được khớp theo tên, nên hãy nhập danh
          mục hàng hoá và danh sách khách hàng trước.
        </p>
        <p className="text-muted-foreground text-sm">
          Số buổi được ghi vào <strong className="text-foreground font-medium">sổ cái</strong>: mỗi
          gói sinh một dòng cấp buổi và một dòng đã dùng. Từ đây trở đi số buổi còn lại là số dư
          sống — bán hàng hay trừ buổi đều đi qua sổ cái này.
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
          <Button
            variant="outline"
            onClick={() => fileRef.current?.click()}
            disabled={pending || reading}
          >
            <Upload className="size-4" /> {reading ? 'Đang đọc tệp…' : 'Chọn tệp'}
          </Button>
          {fileName && <span className="text-muted-foreground text-sm">{fileName}</span>}
        </div>

        {fileError && (
          <p role="alert" className="text-danger bg-danger/10 rounded-md px-4 py-3 text-sm">
            {fileError}
          </p>
        )}

        {missing.length > 0 && (
          <p role="alert" className="text-danger bg-danger/10 rounded-md px-4 py-3 text-sm">
            Tệp thiếu cột bắt buộc: {missing.map((f) => PACKAGE_FIELD_LABEL[f] ?? f).join(', ')}.
          </p>
        )}

        {columns && columns.usedColumns.length > 0 && (
          <div className="bg-muted/40 rounded-md p-4 text-sm">
            <p className="font-medium">Cột đọc được</p>
            <ul className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
              {columns.usedColumns.map((c) => (
                <li key={c.header} className="flex items-baseline gap-2">
                  <span className="truncate">{c.header}</span>
                  <span className="text-muted-foreground shrink-0 text-xs">
                    → {PACKAGE_FIELD_LABEL[c.field] ?? c.field}
                  </span>
                </li>
              ))}
            </ul>
            {columns.ignoredColumns.length > 0 && (
              <p className="text-muted-foreground mt-3 text-xs">
                Bỏ qua {columns.ignoredColumns.length} cột: {columns.ignoredColumns.join(', ')}
              </p>
            )}
          </div>
        )}
      </section>

      {rows.length > 0 && !outcomes && (
        <>
          <section className="border-border bg-card rounded-lg border p-5">
            <h2 className="font-semibold">2. Xem trước</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Đọc được <strong className="text-foreground">{rows.length}</strong> gói
              {problems.length > 0 && (
                <>
                  , bỏ qua <strong className="text-warning">{problems.length}</strong> dòng
                </>
              )}
              {owed > 0 && (
                <>
                  {' · '}tổng <strong className="text-warning">{owed} buổi</strong> khách còn chưa
                  dùng
                </>
              )}
              . Chưa có gì được ghi.
            </p>

            {reserved > 0 && (
              <p className="bg-muted/40 text-muted-foreground mt-3 rounded-md p-3 text-sm">
                Trong đó <strong className="text-foreground font-medium">{reserved} buổi</strong>{' '}
                đang được KiotViet giữ chỗ cho lịch hẹn. Cột &ldquo;SL còn lại&rdquo; của KiotViet
                đã trừ chúng đi, nên vài gói bị đánh dấu &ldquo;đã dùng hết&rdquo; dù khách chưa
                làm. Ở đây chúng được tính là{' '}
                <strong className="text-foreground font-medium">vẫn còn</strong> — đã đặt mà chưa
                làm thì spa vẫn còn nợ khách buổi đó.
              </p>
            )}

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/60 text-muted-foreground text-left">
                  <tr>
                    <th className="px-3 py-2 font-medium">Mã thẻ</th>
                    <th className="px-3 py-2 font-medium">Khách hàng</th>
                    <th className="px-3 py-2 font-medium">Gói</th>
                    <th className="px-3 py-2 text-right font-medium">Giá bán</th>
                    <th className="px-3 py-2 text-right font-medium">Còn lại</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 25).map((r) => (
                    <tr key={r.line} className="border-border border-b last:border-0">
                      <td className="tabular px-3 py-2">{r.code}</td>
                      <td className="px-3 py-2">{r.customerName}</td>
                      <td className="max-w-[22rem] truncate px-3 py-2">{r.packageName}</td>
                      <td className="tabular px-3 py-2 text-right">{formatMoney(r.price)}</td>
                      <td className="tabular px-3 py-2 text-right">
                        {r.remainingSessions || '—'}
                        {r.reservedSessions > 0 && (
                          <span className="text-muted-foreground text-xs">
                            {' '}
                            ({r.reservedSessions} giữ chỗ)
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 25 && (
                <p className="text-muted-foreground mt-2 text-xs">
                  … và {rows.length - 25} gói nữa.
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
            </section>
          )}

          <div className="flex items-center gap-3">
            <Button onClick={run} disabled={pending}>
              {pending ? `Đang ghi ${progress}/${rows.length}…` : `Nhập ${rows.length} gói`}
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
            <Badge tone="success">{created} gói mới</Badge>
            {skipped > 0 && <Badge>{skipped} đã có từ trước</Badge>}
            {failed.length > 0 && <Badge tone="danger">{failed.length} không khớp được</Badge>}
          </div>

          {failed.length > 0 && (
            <div className="border-warning/40 bg-warning/5 rounded-md border p-4 text-sm">
              <p className="text-warning font-medium">Những gói chưa vào được</p>
              <ul className="mt-2 space-y-1">
                {failed.map((f) => (
                  <li key={f.line}>
                    <span className="tabular">{f.code}</span> — {f.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex items-center gap-3">
            <Link href="/admin/packages">
              <Button>Xem gói đã bán</Button>
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
