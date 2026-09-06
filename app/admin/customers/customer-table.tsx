'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Upload } from 'lucide-react'
import type { ColumnDef } from '@tanstack/react-table'
import { DataTable, type PaginationState } from '@/components/data-table/data-table'
import { Badge, FilterGroup, RadioFilter, SelectFilter } from '@/components/data-table/filters'
import { formatDate, formatMoney, formatPhone, matchesSearch } from '@/lib/format'

export interface CustomerRow {
  id: string
  code: string
  name: string
  phone: string | null
  gender: 'male' | 'female' | 'other' | null
  birthday: string | null
  area: string | null
  source: string | null
  groupName: string | null
  note: string | null
  isActive: boolean
  migratedVisits: number | null
  migratedTotalSpent: string | null
  migratedRemainingSessions: number | null
  lastVisitAt: string | null
}

const GENDER_LABEL: Record<string, string> = { female: 'Nữ', male: 'Nam', other: 'Khác' }

type StatusFilter = 'active' | 'inactive' | 'all'

export function CustomerTable({ rows, canManage }: { rows: CustomerRow[]; canManage: boolean }) {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<StatusFilter>('active')
  const [source, setSource] = useState('')
  const [hasPackage, setHasPackage] = useState<'all' | 'yes'>('all')
  const [pagination, setPagination] = useState<PaginationState>({ page: 1, pageSize: 20 })

  const resetPage = () => setPagination((p) => ({ ...p, page: 1 }))

  const sourceOptions = useMemo(
    () =>
      [...new Set(rows.map((r) => r.source).filter(Boolean))].map((s) => ({
        value: s as string,
        label: s as string,
      })),
    [rows],
  )

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (status === 'active' && !r.isActive) return false
        if (status === 'inactive' && r.isActive) return false
        if (source && r.source !== source) return false
        if (hasPackage === 'yes' && !(r.migratedRemainingSessions ?? 0)) return false
        if (search) {
          const haystack = [r.code, r.name, r.phone, r.note].filter(Boolean).join(' ')
          if (!matchesSearch(haystack, search)) return false
        }
        return true
      }),
    [rows, status, source, hasPackage, search],
  )

  const paged = useMemo(() => {
    const start = (pagination.page - 1) * pagination.pageSize
    return filtered.slice(start, start + pagination.pageSize)
  }, [filtered, pagination])

  const columns = useMemo<ColumnDef<CustomerRow, unknown>[]>(
    () => [
      { accessorKey: 'code', header: 'Mã khách' },
      {
        accessorKey: 'name',
        header: 'Tên khách hàng',
        cell: (c) => <span className="font-medium">{c.getValue<string>()}</span>,
      },
      {
        accessorKey: 'phone',
        header: 'Điện thoại',
        cell: (c) => <span className="tabular">{formatPhone(c.getValue<string>()) || '—'}</span>,
      },
      {
        accessorKey: 'gender',
        header: 'Giới tính',
        cell: (c) => GENDER_LABEL[c.getValue<string>()] ?? '—',
      },
      { accessorKey: 'area', header: 'Khu vực', cell: (c) => c.getValue<string>() ?? '—' },
      { accessorKey: 'source', header: 'Nguồn khách', cell: (c) => c.getValue<string>() ?? '—' },
      {
        accessorKey: 'migratedVisits',
        header: 'Lượt ghé',
        cell: (c) => <span className="tabular">{c.getValue<number>() ?? '—'}</span>,
      },
      {
        accessorKey: 'migratedTotalSpent',
        header: 'Đã chi tiêu',
        cell: (c) => <span className="tabular">{formatMoney(c.getValue<string>())}</span>,
      },
      {
        accessorKey: 'migratedRemainingSessions',
        header: 'Buổi còn lại',
        cell: (c) => {
          const n = c.getValue<number>()
          return n ? <Badge tone="warning">{n} buổi</Badge> : <span>—</span>
        },
      },
      {
        accessorKey: 'lastVisitAt',
        header: 'Giao dịch cuối',
        cell: (c) => <span className="tabular">{formatDate(c.getValue<string>()) || '—'}</span>,
      },
    ],
    [],
  )

  const owedSessions = filtered.reduce((s, r) => s + (r.migratedRemainingSessions ?? 0), 0)
  const activeFilterCount =
    (status !== 'active' ? 1 : 0) + (source ? 1 : 0) + (hasPackage !== 'all' ? 1 : 0)

  return (
    <DataTable
      columns={columns}
      data={paged}
      total={filtered.length}
      pagination={pagination}
      onPaginationChange={setPagination}
      storageKey="customers"
      actions={
        canManage ? (
          <Link
            href="/admin/customers/import"
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
        // đầu và câu tổng bị bó trong bề rộng cột "Mã khách".
        <td className="text-muted-foreground px-3 py-2 text-sm" colSpan={columns.length}>
          {filtered.length} khách
          {owedSessions > 0 && (
            <>
              {' · '}
              <strong className="text-warning font-medium">{owedSessions} buổi</strong> spa còn nợ
              khách theo số liệu chuyển từ hệ cũ
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
        placeholder: 'Tìm theo mã, tên, số điện thoại…',
      }}
      activeFilterCount={activeFilterCount}
      onClearFilters={() => {
        setStatus('active')
        setSource('')
        setHasPackage('all')
      }}
      filters={
        <>
          <FilterGroup label="Trạng thái">
            <RadioFilter
              name="cus-status"
              value={status}
              onChange={(v) => {
                setStatus(v)
                resetPage()
              }}
              options={[
                { value: 'active', label: 'Đang hoạt động' },
                { value: 'inactive', label: 'Ngừng' },
                { value: 'all', label: 'Tất cả' },
              ]}
            />
          </FilterGroup>

          <FilterGroup label="Gói còn buổi">
            <RadioFilter
              name="cus-pkg"
              value={hasPackage}
              onChange={(v) => {
                setHasPackage(v)
                resetPage()
              }}
              options={[
                { value: 'all', label: 'Tất cả' },
                { value: 'yes', label: 'Còn buổi chưa dùng' },
              ]}
            />
          </FilterGroup>

          <FilterGroup label="Nguồn khách">
            <SelectFilter
              value={source}
              onChange={(v) => {
                setSource(v)
                resetPage()
              }}
              options={sourceOptions}
            />
          </FilterGroup>
        </>
      }
      exportConfig={{
        fileNamePrefix: 'khach-hang',
        columns: [
          { header: 'Mã khách', value: (r) => r.code },
          { header: 'Tên khách hàng', value: (r) => r.name },
          { header: 'Điện thoại', value: (r) => r.phone },
          { header: 'Giới tính', value: (r) => (r.gender ? GENDER_LABEL[r.gender] : '') },
          { header: 'Ngày sinh', value: (r) => formatDate(r.birthday) },
          { header: 'Khu vực', value: (r) => r.area },
          { header: 'Nguồn khách', value: (r) => r.source },
          { header: 'Lượt ghé', value: (r) => r.migratedVisits },
          { header: 'Đã chi tiêu', value: (r) => r.migratedTotalSpent },
          { header: 'Buổi còn lại', value: (r) => r.migratedRemainingSessions },
          { header: 'Giao dịch cuối', value: (r) => formatDate(r.lastVisitAt) },
        ],
      }}
      mobileCard={(r) => (
        <div className="space-y-1">
          <div className="flex items-start justify-between gap-3">
            <span className="font-medium">{r.name}</span>
            {(r.migratedRemainingSessions ?? 0) > 0 && (
              <Badge tone="warning">{r.migratedRemainingSessions} buổi</Badge>
            )}
          </div>
          <p className="text-muted-foreground text-sm">
            {r.code}
            {r.phone && <span className="tabular"> · {formatPhone(r.phone)}</span>}
          </p>
          {r.area && <p className="text-muted-foreground text-sm">{r.area}</p>}
        </div>
      )}
      emptyMessage="Chưa có khách hàng nào"
    />
  )
}
