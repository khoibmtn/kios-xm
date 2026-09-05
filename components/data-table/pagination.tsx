'use client'

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'

export interface PaginationState {
  page: number // 1-based
  pageSize: number
}

interface Props {
  state: PaginationState
  total: number
  onChange: (next: PaginationState) => void
  pageSizeOptions?: number[]
}

const btn =
  'inline-flex size-9 items-center justify-center rounded-md border border-border text-muted-foreground transition hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent'

export function DataTablePagination({
  state,
  total,
  onChange,
  pageSizeOptions = [10, 20, 50, 100],
}: Props) {
  const lastPage = Math.max(1, Math.ceil(total / state.pageSize))
  const from = total === 0 ? 0 : (state.page - 1) * state.pageSize + 1
  const to = Math.min(state.page * state.pageSize, total)

  const go = (page: number) =>
    onChange({ ...state, page: Math.min(Math.max(1, page), lastPage) })

  return (
    <div className="border-border flex flex-wrap items-center gap-x-4 gap-y-3 border-t px-3 py-2.5 text-sm">
      <label className="text-muted-foreground flex items-center gap-2">
        Hiển thị
        <select
          value={state.pageSize}
          onChange={(e) => onChange({ page: 1, pageSize: Number(e.target.value) })}
          className="border-border text-foreground rounded-md border bg-transparent px-2 py-1.5"
        >
          {pageSizeOptions.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        bản ghi
      </label>

      <div className="ml-auto flex items-center gap-1.5">
        <button
          type="button"
          className={btn}
          onClick={() => go(1)}
          disabled={state.page <= 1}
          aria-label="Trang đầu"
        >
          <ChevronsLeft className="size-4" />
        </button>
        <button
          type="button"
          className={btn}
          onClick={() => go(state.page - 1)}
          disabled={state.page <= 1}
          aria-label="Trang trước"
        >
          <ChevronLeft className="size-4" />
        </button>

        <span className="tabular px-2">
          {state.page} / {lastPage}
        </span>

        <button
          type="button"
          className={btn}
          onClick={() => go(state.page + 1)}
          disabled={state.page >= lastPage}
          aria-label="Trang sau"
        >
          <ChevronRight className="size-4" />
        </button>
        <button
          type="button"
          className={btn}
          onClick={() => go(lastPage)}
          disabled={state.page >= lastPage}
          aria-label="Trang cuối"
        >
          <ChevronsRight className="size-4" />
        </button>
      </div>

      <p className="text-muted-foreground tabular basis-full text-center sm:basis-auto sm:text-left">
        {from}–{to} trên tổng số {new Intl.NumberFormat('vi-VN').format(total)}
      </p>
    </div>
  )
}
