'use client'

import { useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { DataTable, type PaginationState } from '@/components/data-table/data-table'
import { Badge, CheckboxFilter, FilterGroup } from '@/components/data-table/filters'
import { formatDateTime, formatRelative, matchesSearch } from '@/lib/format'

export interface AuditRow {
  id: string
  entity: string
  entityId: string
  action: string
  reason: string | null
  createdAt: Date
  userName: string | null
}

const ACTION_LABELS: Record<string, { label: string; tone: 'neutral' | 'success' | 'warning' | 'danger' }> = {
  create: { label: 'Tạo mới', tone: 'success' },
  update: { label: 'Sửa', tone: 'neutral' },
  delete: { label: 'Xoá', tone: 'danger' },
  view: { label: 'Xem', tone: 'neutral' },
  login: { label: 'Đăng nhập', tone: 'neutral' },
  export: { label: 'Xuất file', tone: 'warning' },
  cancel: { label: 'Huỷ', tone: 'danger' },
  adjust: { label: 'Điều chỉnh', tone: 'warning' },
}

export function AuditTable({ rows }: { rows: AuditRow[] }) {
  const [search, setSearch] = useState('')
  const [actions, setActions] = useState<string[]>([])
  const [pagination, setPagination] = useState<PaginationState>({ page: 1, pageSize: 20 })

  const actionOptions = useMemo(() => {
    const counts = new Map<string, number>()
    for (const r of rows) counts.set(r.action, (counts.get(r.action) ?? 0) + 1)
    return [...counts.entries()].map(([value, n]) => ({
      value,
      label: ACTION_LABELS[value]?.label ?? value,
      hint: String(n),
    }))
  }, [rows])

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (actions.length > 0 && !actions.includes(r.action)) return false
        if (search) {
          const haystack = [r.entity, r.entityId, r.userName, r.reason].filter(Boolean).join(' ')
          if (!matchesSearch(haystack, search)) return false
        }
        return true
      }),
    [rows, actions, search],
  )

  const paged = useMemo(() => {
    const start = (pagination.page - 1) * pagination.pageSize
    return filtered.slice(start, start + pagination.pageSize)
  }, [filtered, pagination])

  const columns = useMemo<ColumnDef<AuditRow, unknown>[]>(
    () => [
      {
        accessorKey: 'createdAt',
        header: 'Thời gian',
        cell: (c) => (
          <div>
            <div className="tabular whitespace-nowrap">{formatDateTime(c.getValue<Date>())}</div>
            <div className="text-muted-foreground text-xs">
              {formatRelative(c.getValue<Date>())}
            </div>
          </div>
        ),
      },
      { accessorKey: 'userName', header: 'Người thao tác', cell: (c) => c.getValue<string>() ?? 'Hệ thống' },
      {
        accessorKey: 'action',
        header: 'Hành động',
        cell: (c) => {
          const a = ACTION_LABELS[c.getValue<string>()]
          return <Badge tone={a?.tone ?? 'neutral'}>{a?.label ?? c.getValue<string>()}</Badge>
        },
      },
      { accessorKey: 'entity', header: 'Đối tượng' },
      {
        accessorKey: 'entityId',
        header: 'Mã bản ghi',
        cell: (c) => (
          <span className="text-muted-foreground font-mono text-xs">
            {c.getValue<string>().slice(0, 8)}…
          </span>
        ),
      },
      { accessorKey: 'reason', header: 'Lý do', cell: (c) => c.getValue<string>() ?? '—' },
    ],
    [],
  )

  return (
    <DataTable
      columns={columns}
      data={paged}
      total={filtered.length}
      pagination={pagination}
      onPaginationChange={setPagination}
      storageKey="audit"
      search={{
        value: search,
        onChange: (v) => {
          setSearch(v)
          setPagination((p) => ({ ...p, page: 1 }))
        },
        placeholder: 'Tìm theo đối tượng, người thao tác…',
      }}
      activeFilterCount={actions.length}
      onClearFilters={() => setActions([])}
      filters={
        <FilterGroup label="Hành động">
          <CheckboxFilter
            values={actions}
            onChange={(v) => {
              setActions(v)
              setPagination((p) => ({ ...p, page: 1 }))
            }}
            options={actionOptions}
          />
        </FilterGroup>
      }
      exportConfig={{
        fileNamePrefix: 'nhat-ky-thao-tac',
        columns: [
          { header: 'Thời gian', value: (r) => formatDateTime(r.createdAt) },
          { header: 'Người thao tác', value: (r) => r.userName ?? 'Hệ thống' },
          { header: 'Hành động', value: (r) => ACTION_LABELS[r.action]?.label ?? r.action },
          { header: 'Đối tượng', value: (r) => r.entity },
          { header: 'Mã bản ghi', value: (r) => r.entityId },
          { header: 'Lý do', value: (r) => r.reason },
        ],
      }}
      mobileCard={(r) => (
        <div className="space-y-1">
          <div className="flex items-start justify-between gap-3">
            <span className="font-medium">{r.entity}</span>
            <Badge tone={ACTION_LABELS[r.action]?.tone ?? 'neutral'}>
              {ACTION_LABELS[r.action]?.label ?? r.action}
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm">
            {r.userName ?? 'Hệ thống'} · {formatRelative(r.createdAt)}
          </p>
          {r.reason && <p className="text-muted-foreground text-sm">{r.reason}</p>}
        </div>
      )}
      emptyMessage="Chưa có thao tác nào được ghi lại"
    />
  )
}
