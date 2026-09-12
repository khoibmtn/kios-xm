'use client'

import { useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle, CheckCircle2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/data-table/filters'
import { formatDate, formatPhone } from '@/lib/format'
import { readImportFile } from '@/lib/catalog/import-file'
import {
  EMPLOYEE_FIELD_LABEL,
  toEmployeeRows,
  type EmployeeImportPlan,
  type EmployeeImportRow,
} from '@/lib/employees/import-map'
import { importEmployeesAction, type EmployeeImportOutcome } from './actions'

const BATCH_SIZE = 50

export function EmployeeImportPanel() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)

  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState<EmployeeImportRow[]>([])
  const [problems, setProblems] = useState<EmployeeImportPlan['problems']>([])
  const [missing, setMissing] = useState<string[]>([])
  const [columns, setColumns] = useState<Pick<
    EmployeeImportPlan,
    'usedColumns' | 'ignoredColumns'
  > | null>(null)
  const [fileError, setFileError] = useState('')
  const [outcomes, setOutcomes] = useState<EmployeeImportOutcome[] | null>(null)
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
      const plan = toEmployeeRows(parsed)
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
      const all: EmployeeImportOutcome[] = []
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const result = await importEmployeesAction(rows.slice(i, i + BATCH_SIZE))
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

  return (
    <div className="space-y-4">
      <section className="border-border bg-card space-y-3 rounded-lg border p-5">
        <h2 className="font-semibold">1. Chọn tệp</h2>
        <p className="text-muted-foreground text-sm">
          Tệp Excel (.xlsx) hoặc CSV — bản xuất{' '}
          <strong className="text-foreground font-medium">Danh sách nhân viên</strong> từ KiotViet
          dùng thẳng được. Bắt buộc hai cột{' '}
          <strong className="text-foreground font-medium">Mã nhân viên</strong> và{' '}
          <strong className="text-foreground font-medium">Tên nhân viên</strong>; các cột khác có
          thì dùng. Phòng ban và chức danh chưa có sẽ được tạo tự động.
        </p>
        <p className="text-muted-foreground text-sm">
          Mã nhân viên trùng thì được{' '}
          <strong className="text-foreground font-medium">cập nhật hồ sơ</strong>, không tạo bản sao
          — nên nhập lại nhiều lần vẫn an toàn. Tài khoản đăng nhập{' '}
          <strong className="text-foreground font-medium">không</strong> bị đụng tới: cấp tài khoản
          là việc riêng, phải qua đặt mật khẩu.
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
            Tệp thiếu cột bắt buộc: {missing.map((f) => EMPLOYEE_FIELD_LABEL[f] ?? f).join(', ')}.
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
                    → {EMPLOYEE_FIELD_LABEL[c.field] ?? c.field}
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
              Đọc được <strong className="text-foreground">{rows.length}</strong> nhân viên
              {problems.length > 0 && (
                <>
                  , bỏ qua <strong className="text-warning">{problems.length}</strong> dòng
                </>
              )}
              . Chưa có gì được ghi.
            </p>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/60 text-muted-foreground text-left">
                  <tr>
                    <th className="px-3 py-2 font-medium">Mã NV</th>
                    <th className="px-3 py-2 font-medium">Tên nhân viên</th>
                    <th className="px-3 py-2 font-medium">Điện thoại</th>
                    <th className="px-3 py-2 font-medium">Chức danh</th>
                    <th className="px-3 py-2 font-medium">Vào làm</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 20).map((r) => (
                    <tr key={r.line} className="border-border border-b last:border-0">
                      <td className="tabular px-3 py-2">{r.code}</td>
                      <td className="px-3 py-2 font-medium">{r.fullName}</td>
                      <td className="tabular px-3 py-2">{formatPhone(r.phone) || '—'}</td>
                      <td className="px-3 py-2">{r.position || '—'}</td>
                      <td className="tabular px-3 py-2">{formatDate(r.hiredAt) || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 20 && (
                <p className="text-muted-foreground mt-2 text-xs">
                  … và {rows.length - 20} nhân viên nữa.
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
              {pending ? `Đang ghi ${progress}/${rows.length}…` : `Nhập ${rows.length} nhân viên`}
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
          </div>
          <div className="flex items-center gap-3">
            <Link href="/admin/employees">
              <Button>Xem danh sách nhân viên</Button>
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
