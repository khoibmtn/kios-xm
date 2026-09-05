'use client'

import { useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { DataTable, type PaginationState } from '@/components/data-table/data-table'
import { Badge, FilterGroup, RadioFilter, SelectFilter } from '@/components/data-table/filters'
import { formatDate, formatPhone, matchesSearch } from '@/lib/format'

export interface EmployeeRow {
  id: string
  code: string
  clockCode: string | null
  fullName: string
  phone: string | null
  idNumber: string | null
  status: 'working' | 'left'
  /** Cột DATE thuần — giữ dạng chuỗi "YYYY-MM-DD" để không lệch ngày vì múi giờ. */
  hiredAt: string | null
  note: string | null
  departmentName: string | null
  positionName: string | null
  branchName: string | null
}

type StatusFilter = 'working' | 'left' | 'all'

export function EmployeeTable({ rows }: { rows: EmployeeRow[] }) {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<StatusFilter>('working')
  const [department, setDepartment] = useState('')
  const [pagination, setPagination] = useState<PaginationState>({ page: 1, pageSize: 20 })

  const departmentOptions = useMemo(
    () =>
      [...new Set(rows.map((r) => r.departmentName).filter(Boolean))].map((d) => ({
        value: d as string,
        label: d as string,
      })),
    [rows],
  )

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (status !== 'all' && r.status !== status) return false
      if (department && r.departmentName !== department) return false
      if (search) {
        const haystack = [r.code, r.fullName, r.phone, r.idNumber, r.clockCode]
          .filter(Boolean)
          .join(' ')
        if (!matchesSearch(haystack, search)) return false
      }
      return true
    })
  }, [rows, status, department, search])

  const paged = useMemo(() => {
    const start = (pagination.page - 1) * pagination.pageSize
    return filtered.slice(start, start + pagination.pageSize)
  }, [filtered, pagination])

  const columns = useMemo<ColumnDef<EmployeeRow, unknown>[]>(
    () => [
      { accessorKey: 'code', header: 'Mã nhân viên' },
      { accessorKey: 'clockCode', header: 'Mã chấm công', cell: (c) => c.getValue<string>() ?? '—' },
      {
        accessorKey: 'fullName',
        header: 'Tên nhân viên',
        cell: (c) => <span className="font-medium">{c.getValue<string>()}</span>,
      },
      {
        accessorKey: 'phone',
        header: 'Số điện thoại',
        cell: (c) => <span className="tabular">{formatPhone(c.getValue<string>())}</span>,
      },
      { accessorKey: 'positionName', header: 'Chức danh', cell: (c) => c.getValue<string>() ?? '—' },
      { accessorKey: 'departmentName', header: 'Phòng ban', cell: (c) => c.getValue<string>() ?? '—' },
      { accessorKey: 'branchName', header: 'Chi nhánh', cell: (c) => c.getValue<string>() ?? '—' },
      {
        accessorKey: 'hiredAt',
        header: 'Ngày vào làm',
        cell: (c) => <span className="tabular">{formatDate(c.getValue<string>()) || '—'}</span>,
      },
      {
        accessorKey: 'status',
        header: 'Trạng thái',
        cell: (c) =>
          c.getValue<string>() === 'working' ? (
            <Badge tone="success">Đang làm việc</Badge>
          ) : (
            <Badge>Đã nghỉ</Badge>
          ),
      },
    ],
    [],
  )

  const activeFilterCount = (status !== 'working' ? 1 : 0) + (department ? 1 : 0)

  return (
    <DataTable
      columns={columns}
      data={paged}
      total={filtered.length}
      pagination={pagination}
      onPaginationChange={setPagination}
      storageKey="employees"
      search={{
        value: search,
        onChange: (v) => {
          setSearch(v)
          setPagination((p) => ({ ...p, page: 1 }))
        },
        placeholder: 'Tìm theo mã, tên, số điện thoại…',
      }}
      activeFilterCount={activeFilterCount}
      onClearFilters={() => {
        setStatus('working')
        setDepartment('')
      }}
      filters={
        <>
          <FilterGroup label="Trạng thái">
            <RadioFilter
              name="emp-status"
              value={status}
              onChange={(v) => {
                setStatus(v)
                setPagination((p) => ({ ...p, page: 1 }))
              }}
              options={[
                { value: 'working', label: 'Đang làm việc' },
                { value: 'left', label: 'Đã nghỉ' },
                { value: 'all', label: 'Tất cả' },
              ]}
            />
          </FilterGroup>

          <FilterGroup label="Phòng ban">
            <SelectFilter
              value={department}
              onChange={(v) => {
                setDepartment(v)
                setPagination((p) => ({ ...p, page: 1 }))
              }}
              options={departmentOptions}
            />
          </FilterGroup>
        </>
      }
      exportConfig={{
        fileNamePrefix: 'nhan-vien',
        columns: [
          { header: 'Mã nhân viên', value: (r) => r.code },
          { header: 'Mã chấm công', value: (r) => r.clockCode },
          { header: 'Tên nhân viên', value: (r) => r.fullName },
          { header: 'Số điện thoại', value: (r) => r.phone },
          { header: 'Số CMND/CCCD', value: (r) => r.idNumber },
          { header: 'Chức danh', value: (r) => r.positionName },
          { header: 'Phòng ban', value: (r) => r.departmentName },
          { header: 'Chi nhánh', value: (r) => r.branchName },
          { header: 'Ngày vào làm', value: (r) => formatDate(r.hiredAt) },
          { header: 'Trạng thái', value: (r) => (r.status === 'working' ? 'Đang làm việc' : 'Đã nghỉ') },
        ],
      }}
      mobileCard={(r) => (
        <div className="space-y-1">
          <div className="flex items-start justify-between gap-3">
            <span className="font-medium">{r.fullName}</span>
            {r.status === 'working' ? (
              <Badge tone="success">Đang làm</Badge>
            ) : (
              <Badge>Đã nghỉ</Badge>
            )}
          </div>
          <p className="text-muted-foreground text-sm">
            {r.code}
            {r.phone && <span className="tabular"> · {formatPhone(r.phone)}</span>}
          </p>
          {(r.positionName || r.departmentName) && (
            <p className="text-muted-foreground text-sm">
              {[r.positionName, r.departmentName].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
      )}
      emptyMessage="Chưa có nhân viên nào"
    />
  )
}
