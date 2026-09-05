'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ChevronsUpDown, Download, Search, SlidersHorizontal, X } from 'lucide-react'
import { DataTablePagination, type PaginationState } from './pagination'
import { downloadCsv, exportFileName, type ExportColumn } from './export-csv'

/**
 * Bảng dữ liệu dùng chung.
 *
 * Mọi màn hình danh sách trong kios-xm đều theo cùng một bố cục: bộ lọc bên
 * trái, bảng bên phải, dòng tổng ghim trên đầu, phân trang dưới cùng
 * (xem `docs/research/03-ux-flows.md` §7). Làm một lần ở đây để 10+ module
 * sau không phải dựng lại.
 *
 * Trên điện thoại bảng ngang không dùng được, nên tự chuyển sang danh sách thẻ.
 */

export interface DataTableProps<T> {
  columns: ColumnDef<T, unknown>[]
  data: T[]
  /** Tổng số bản ghi ở máy chủ (khác `data.length` khi phân trang phía máy chủ). */
  total: number

  pagination: PaginationState
  onPaginationChange: (next: PaginationState) => void

  search?: {
    value: string
    onChange: (value: string) => void
    placeholder?: string
  }

  /** Nội dung cột lọc bên trái. */
  filters?: ReactNode
  /** Số bộ lọc đang bật — hiện trên nút lọc ở điện thoại. */
  activeFilterCount?: number
  onClearFilters?: () => void

  /** Dòng tổng ghim trên đầu bảng, ví dụ tổng tồn kho. */
  summaryRow?: ReactNode

  /** Nút hành động bên phải thanh công cụ (Thêm mới, Nhập file…). */
  actions?: ReactNode

  /** Hiển thị một bản ghi dưới dạng thẻ trên điện thoại. */
  mobileCard?: (row: T) => ReactNode

  /** Bấm vào dòng — thường để mở chi tiết. */
  onRowClick?: (row: T) => void

  /** Cấu hình xuất CSV. Bỏ trống thì ẩn nút xuất. */
  exportConfig?: {
    fileNamePrefix: string
    columns: ExportColumn<T>[]
  }

  /** Khoá lưu tuỳ chỉnh ẩn/hiện cột vào trình duyệt. */
  storageKey?: string

  isLoading?: boolean
  emptyMessage?: string
}

export function DataTable<T>({
  columns,
  data,
  total,
  pagination,
  onPaginationChange,
  search,
  filters,
  activeFilterCount = 0,
  onClearFilters,
  summaryRow,
  actions,
  mobileCard,
  onRowClick,
  exportConfig,
  storageKey,
  isLoading = false,
  emptyMessage = 'Chưa có dữ liệu',
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [showFilters, setShowFilters] = useState(false)
  const [showColumnMenu, setShowColumnMenu] = useState(false)

  // Người dùng ẩn bớt cột thì lần sau mở lại vẫn như cũ.
  useEffect(() => {
    if (!storageKey) return
    try {
      const saved = localStorage.getItem(`kiosxm.cols.${storageKey}`)
      if (saved) setColumnVisibility(JSON.parse(saved))
    } catch {
      // localStorage bị chặn (chế độ riêng tư) — chấp nhận mất tuỳ chỉnh
    }
  }, [storageKey])

  useEffect(() => {
    if (!storageKey) return
    try {
      localStorage.setItem(`kiosxm.cols.${storageKey}`, JSON.stringify(columnVisibility))
    } catch {
      /* bỏ qua */
    }
  }, [columnVisibility, storageKey])

  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnVisibility },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualPagination: true,
  })

  const hideableColumns = useMemo(
    () => table.getAllLeafColumns().filter((c) => c.getCanHide()),
    [table],
  )

  const rows = table.getRowModel().rows

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      {/* Cột lọc — ẩn sau nút trên điện thoại */}
      {filters && (
        <>
          <aside className="border-border bg-card hidden w-60 shrink-0 rounded-lg border p-4 lg:block">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Bộ lọc</h2>
              {activeFilterCount > 0 && onClearFilters && (
                <button
                  type="button"
                  onClick={onClearFilters}
                  className="text-primary text-xs hover:underline"
                >
                  Bỏ lọc
                </button>
              )}
            </div>
            <div className="space-y-4">{filters}</div>
          </aside>

          {showFilters && (
            <div className="fixed inset-0 z-50 lg:hidden">
              <button
                type="button"
                aria-label="Đóng bộ lọc"
                className="absolute inset-0 bg-black/40"
                onClick={() => setShowFilters(false)}
              />
              <div className="bg-card absolute inset-y-0 left-0 w-72 overflow-y-auto p-4 shadow-xl">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="font-semibold">Bộ lọc</h2>
                  <button
                    type="button"
                    onClick={() => setShowFilters(false)}
                    aria-label="Đóng"
                    className="text-muted-foreground"
                  >
                    <X className="size-5" />
                  </button>
                </div>
                <div className="space-y-4">{filters}</div>
                {activeFilterCount > 0 && onClearFilters && (
                  <button
                    type="button"
                    onClick={onClearFilters}
                    className="border-border mt-6 w-full rounded-md border py-2.5 text-sm"
                  >
                    Bỏ lọc
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      )}

      <div className="border-border bg-card min-w-0 flex-1 rounded-lg border">
        {/* Thanh công cụ */}
        <div className="border-border flex flex-wrap items-center gap-2 border-b p-3">
          {filters && (
            <button
              type="button"
              onClick={() => setShowFilters(true)}
              className="border-border inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm lg:hidden"
            >
              <SlidersHorizontal className="size-4" />
              Lọc
              {activeFilterCount > 0 && (
                <span className="bg-primary text-primary-foreground rounded-full px-1.5 text-xs">
                  {activeFilterCount}
                </span>
              )}
            </button>
          )}

          {search && (
            <div className="relative min-w-0 flex-1 sm:max-w-xs">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <input
                type="search"
                value={search.value}
                onChange={(e) => search.onChange(e.target.value)}
                placeholder={search.placeholder ?? 'Tìm kiếm…'}
                className="border-border focus-visible:ring-ring w-full rounded-md border py-2 pr-3 pl-9 text-sm focus-visible:ring-2 focus-visible:outline-none"
              />
            </div>
          )}

          <div className="ml-auto flex items-center gap-2">
            {actions}

            {exportConfig && (
              <button
                type="button"
                onClick={() =>
                  downloadCsv(
                    exportFileName(exportConfig.fileNamePrefix),
                    data,
                    exportConfig.columns,
                  )
                }
                className="border-border inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
              >
                <Download className="size-4" />
                <span className="hidden sm:inline">Xuất file</span>
              </button>
            )}

            {hideableColumns.length > 0 && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowColumnMenu((v) => !v)}
                  aria-label="Tuỳ chỉnh cột"
                  className="border-border hidden items-center rounded-md border p-2 lg:inline-flex"
                >
                  <SlidersHorizontal className="size-4" />
                </button>

                {showColumnMenu && (
                  <>
                    <button
                      type="button"
                      aria-label="Đóng"
                      className="fixed inset-0 z-10 cursor-default"
                      onClick={() => setShowColumnMenu(false)}
                    />
                    <div className="border-border bg-card absolute right-0 z-20 mt-1 w-56 rounded-md border p-2 shadow-lg">
                      <p className="text-muted-foreground px-2 py-1 text-xs font-semibold">
                        Hiển thị cột
                      </p>
                      <div className="max-h-72 overflow-y-auto">
                        {hideableColumns.map((col) => (
                          <label
                            key={col.id}
                            className="hover:bg-muted flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm"
                          >
                            <input
                              type="checkbox"
                              checked={col.getIsVisible()}
                              onChange={col.getToggleVisibilityHandler()}
                            />
                            {typeof col.columnDef.header === 'string'
                              ? col.columnDef.header
                              : col.id}
                          </label>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Bảng — máy tính bảng trở lên */}
        <div className={mobileCard ? 'hidden overflow-x-auto md:block' : 'overflow-x-auto'}>
          <table className="w-full text-sm">
            <thead className="bg-muted/60">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((header) => {
                    const canSort = header.column.getCanSort()
                    const sorted = header.column.getIsSorted()
                    return (
                      <th
                        key={header.id}
                        className="text-muted-foreground px-3 py-2.5 text-left font-medium whitespace-nowrap"
                      >
                        {header.isPlaceholder ? null : canSort ? (
                          <button
                            type="button"
                            onClick={header.column.getToggleSortingHandler()}
                            className="hover:text-foreground inline-flex items-center gap-1"
                          >
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {sorted === 'asc' ? (
                              <ArrowUp className="size-3.5" />
                            ) : sorted === 'desc' ? (
                              <ArrowDown className="size-3.5" />
                            ) : (
                              <ChevronsUpDown className="size-3.5 opacity-40" />
                            )}
                          </button>
                        ) : (
                          flexRender(header.column.columnDef.header, header.getContext())
                        )}
                      </th>
                    )
                  })}
                </tr>
              ))}
            </thead>

            <tbody>
              {summaryRow && (
                <tr className="bg-warning/5 border-border border-b font-medium">
                  {summaryRow}
                </tr>
              )}

              {isLoading ? (
                <tr>
                  <td
                    colSpan={table.getVisibleLeafColumns().length}
                    className="text-muted-foreground px-3 py-10 text-center"
                  >
                    Đang tải…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={table.getVisibleLeafColumns().length}
                    className="text-muted-foreground px-3 py-10 text-center"
                  >
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr
                    key={row.id}
                    onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                    className={`border-border border-b last:border-0 ${
                      onRowClick ? 'hover:bg-muted/50 cursor-pointer' : ''
                    }`}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-3 py-2.5">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Thẻ — điện thoại */}
        {mobileCard && (
          <div className="divide-border divide-y md:hidden">
            {isLoading ? (
              <p className="text-muted-foreground px-4 py-10 text-center text-sm">Đang tải…</p>
            ) : rows.length === 0 ? (
              <p className="text-muted-foreground px-4 py-10 text-center text-sm">
                {emptyMessage}
              </p>
            ) : (
              rows.map((row) => (
                <div
                  key={row.id}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  className={`p-4 ${onRowClick ? 'active:bg-muted/50 cursor-pointer' : ''}`}
                >
                  {mobileCard(row.original)}
                </div>
              ))
            )}
          </div>
        )}

        <DataTablePagination
          state={pagination}
          total={total}
          onChange={onPaginationChange}
        />
      </div>
    </div>
  )
}

export type { PaginationState } from './pagination'
export type { ExportColumn } from './export-csv'
