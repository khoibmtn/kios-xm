'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Upload } from 'lucide-react'
import type { ColumnDef } from '@tanstack/react-table'
import { DataTable, type PaginationState } from '@/components/data-table/data-table'
import { Badge, FilterGroup, RadioFilter } from '@/components/data-table/filters'
import { formatDate, formatMoney, matchesSearch } from '@/lib/format'

export interface PackageRow {
  id: string
  code: string
  packageName: string
  customerName: string
  customerCode: string
  soldAt: string
  expiresAt: string | null
  price: string
  status: 'active' | 'used_up' | 'expired' | 'cancelled'
  /** Tên (các) dịch vụ trong gói, nối bằng ", " nếu nhiều hơn một. */
  serviceName: string | null
  totalSessions: number
  usedSessions: number
  remainingSessions: number
  /** Buổi KiotViet đang giữ chỗ cho lịch hẹn từ hệ cũ — chỉ để tra cứu. */
  reservedSessions: number
  isMigrated: boolean
}

const STATUS_META: Record<
  PackageRow['status'],
  { label: string; tone: 'success' | 'neutral' | 'warning' | 'danger' }
> = {
  active: { label: 'Đang dùng', tone: 'success' },
  used_up: { label: 'Đã dùng hết', tone: 'neutral' },
  expired: { label: 'Hết hạn', tone: 'warning' },
  cancelled: { label: 'Đã huỷ', tone: 'danger' },
}

type StatusFilter = 'all' | 'active' | 'used_up'
type RemainingFilter = 'all' | 'yes'

export function PackageTable({ rows, canManage }: { rows: PackageRow[]; canManage: boolean }) {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [remainingOnly, setRemainingOnly] = useState<RemainingFilter>('all')
  const [pagination, setPagination] = useState<PaginationState>({ page: 1, pageSize: 20 })

  const resetPage = () => setPagination((p) => ({ ...p, page: 1 }))

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (status !== 'all' && r.status !== status) return false
        if (remainingOnly === 'yes' && r.remainingSessions <= 0) return false
        if (search) {
          const haystack = [r.code, r.customerName, r.packageName].filter(Boolean).join(' ')
          if (!matchesSearch(haystack, search)) return false
        }
        return true
      }),
    [rows, status, remainingOnly, search],
  )

  const paged = useMemo(() => {
    const start = (pagination.page - 1) * pagination.pageSize
    return filtered.slice(start, start + pagination.pageSize)
  }, [filtered, pagination])

  const columns = useMemo<ColumnDef<PackageRow, unknown>[]>(
    () => [
      { accessorKey: 'code', header: 'Mã thẻ' },
      {
        accessorKey: 'customerName',
        header: 'Khách hàng',
        cell: (c) => {
          const row = c.row.original
          return (
            <div>
              <div className="font-medium">{row.customerName}</div>
              <div className="text-muted-foreground text-xs">{row.customerCode}</div>
            </div>
          )
        },
      },
      {
        accessorKey: 'packageName',
        header: 'Gói/liệu trình',
        cell: (c) => {
          const row = c.row.original
          return (
            <div>
              <div className="font-medium">{row.packageName}</div>
              {row.serviceName && (
                <div className="text-muted-foreground text-xs">{row.serviceName}</div>
              )}
              {row.reservedSessions > 0 && (
                <div className="text-muted-foreground text-xs">
                  {row.reservedSessions} buổi đang giữ chỗ cho lịch hẹn từ hệ cũ
                </div>
              )}
            </div>
          )
        },
      },
      {
        accessorKey: 'soldAt',
        header: 'Ngày bán',
        cell: (c) => <span className="tabular">{formatDate(c.getValue<string>())}</span>,
      },
      {
        accessorKey: 'price',
        header: 'Giá bán',
        cell: (c) => <span className="tabular">{formatMoney(c.getValue<string>())}</span>,
      },
      {
        accessorKey: 'totalSessions',
        header: 'Tổng buổi',
        cell: (c) => <span className="tabular">{c.getValue<number>()}</span>,
      },
      {
        accessorKey: 'usedSessions',
        header: 'Đã dùng',
        cell: (c) => <span className="tabular">{c.getValue<number>()}</span>,
      },
      {
        accessorKey: 'remainingSessions',
        header: 'Còn lại',
        cell: (c) => {
          const n = c.getValue<number>()
          return n > 0 ? <Badge tone="warning">{n} buổi</Badge> : <span>—</span>
        },
      },
      {
        accessorKey: 'status',
        header: 'Trạng thái',
        cell: (c) => {
          const meta = STATUS_META[c.getValue<PackageRow['status']>()]
          return <Badge tone={meta.tone}>{meta.label}</Badge>
        },
      },
    ],
    [],
  )

  const owedSessions = filtered.reduce((s, r) => s + r.remainingSessions, 0)
  const activeFilterCount = (status !== 'all' ? 1 : 0) + (remainingOnly !== 'all' ? 1 : 0)

  return (
    <DataTable
      columns={columns}
      data={paged}
      total={filtered.length}
      pagination={pagination}
      onPaginationChange={setPagination}
      storageKey="packages"
      actions={
        canManage ? (
          <Link
            href="/admin/packages/import"
            className="border-border hover:bg-muted inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium"
          >
            <Upload className="size-4" />
            <span className="hidden sm:inline">Nhập file</span>
          </Link>
        ) : undefined
      }
      summaryRow={
        // `DataTable` đặt thẳng nội dung này vào một `<tr>`, nên phải là ô
        // `<td>` trải hết bảng — trả về `<span>` thì trình duyệt nhét vào cột
        // đầu và câu tổng bị bó trong bề rộng cột "Mã thẻ".
        <td className="text-muted-foreground px-3 py-2 text-sm" colSpan={columns.length}>
          {filtered.length} gói
          {owedSessions > 0 && (
            <>
              {' · '}
              <strong className="text-warning font-medium">{owedSessions} buổi</strong> spa còn nợ
              khách
            </>
          )}
        </td>
      }
      search={{
        value: search,
        onChange: (v) => {
          setSearch(v)
          resetPage()
        },
        placeholder: 'Tìm theo mã thẻ, tên khách, tên gói…',
      }}
      activeFilterCount={activeFilterCount}
      onClearFilters={() => {
        setStatus('all')
        setRemainingOnly('all')
      }}
      filters={
        <>
          <FilterGroup label="Trạng thái">
            <RadioFilter
              name="pkg-status"
              value={status}
              onChange={(v) => {
                setStatus(v)
                resetPage()
              }}
              options={[
                { value: 'all', label: 'Tất cả' },
                { value: 'active', label: 'Đang dùng' },
                { value: 'used_up', label: 'Đã dùng hết' },
              ]}
            />
          </FilterGroup>

          <FilterGroup label="Số buổi">
            <RadioFilter
              name="pkg-remaining"
              value={remainingOnly}
              onChange={(v) => {
                setRemainingOnly(v)
                resetPage()
              }}
              options={[
                { value: 'all', label: 'Tất cả' },
                { value: 'yes', label: 'Còn buổi' },
              ]}
            />
          </FilterGroup>
        </>
      }
      exportConfig={{
        fileNamePrefix: 'goi-da-ban',
        columns: [
          { header: 'Mã thẻ', value: (r) => r.code },
          { header: 'Khách hàng', value: (r) => r.customerName },
          { header: 'Mã khách hàng', value: (r) => r.customerCode },
          { header: 'Gói/liệu trình', value: (r) => r.packageName },
          { header: 'Dịch vụ', value: (r) => r.serviceName },
          { header: 'Ngày bán', value: (r) => formatDate(r.soldAt) },
          { header: 'Ngày hết hạn', value: (r) => formatDate(r.expiresAt) },
          { header: 'Giá bán', value: (r) => r.price },
          { header: 'Tổng buổi', value: (r) => r.totalSessions },
          { header: 'Đã dùng', value: (r) => r.usedSessions },
          { header: 'Còn lại', value: (r) => r.remainingSessions },
          { header: 'Trạng thái', value: (r) => STATUS_META[r.status].label },
        ],
      }}
      mobileCard={(r) => (
        <div className="space-y-1">
          <div className="flex items-start justify-between gap-3">
            <span className="font-medium">{r.customerName}</span>
            {r.remainingSessions > 0 && <Badge tone="warning">{r.remainingSessions} buổi</Badge>}
          </div>
          <p className="text-muted-foreground text-sm">
            {r.code} · {r.packageName}
          </p>
        </div>
      )}
      emptyMessage="Chưa có gói nào được bán"
    />
  )
}
