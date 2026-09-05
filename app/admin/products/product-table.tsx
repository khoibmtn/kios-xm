'use client'

import { useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { DataTable, type PaginationState } from '@/components/data-table/data-table'
import { Badge, CheckboxFilter, FilterGroup, RadioFilter, SelectFilter } from '@/components/data-table/filters'
import { formatDuration, formatMoney, formatQuantity, matchesSearch } from '@/lib/format'
import { KIND_LABEL, KIND_ORDER, KIND_TONE, formatValidity, type ProductKind } from '@/lib/catalog/labels'

export interface ProductRow {
  id: string
  code: string
  name: string
  kind: ProductKind
  basePrice: string
  cost: string | null
  durationMinutes: number | null
  cardFaceValue: string | null
  cardBonusValue: string | null
  validityType: string | null
  validityValue: number | null
  trackInventory: boolean
  minQuantity: string | null
  isActive: boolean
  allowsSale: boolean
  categoryName: string | null
  brandName: string | null
  unitName: string | null
  onHand: string | null
}

type StockFilter = 'all' | 'low' | 'out'

export function ProductTable({ rows, showCost }: { rows: ProductRow[]; showCost: boolean }) {
  const [search, setSearch] = useState('')
  const [kinds, setKinds] = useState<ProductKind[]>([])
  const [category, setCategory] = useState('')
  const [brand, setBrand] = useState('')
  const [stock, setStock] = useState<StockFilter>('all')
  const [activeOnly, setActiveOnly] = useState(true)
  const [pagination, setPagination] = useState<PaginationState>({ page: 1, pageSize: 20 })

  const resetPage = () => setPagination((p) => ({ ...p, page: 1 }))

  const kindOptions = useMemo(() => {
    const counts = new Map<ProductKind, number>()
    for (const r of rows) counts.set(r.kind, (counts.get(r.kind) ?? 0) + 1)
    return KIND_ORDER.filter((k) => counts.has(k)).map((k) => ({
      value: k,
      label: KIND_LABEL[k],
      hint: String(counts.get(k)),
    }))
  }, [rows])

  const categoryOptions = useMemo(
    () =>
      [...new Set(rows.map((r) => r.categoryName).filter(Boolean))]
        .sort()
        .map((c) => ({ value: c as string, label: c as string })),
    [rows],
  )

  const brandOptions = useMemo(
    () =>
      [...new Set(rows.map((r) => r.brandName).filter(Boolean))]
        .sort()
        .map((b) => ({ value: b as string, label: b as string })),
    [rows],
  )

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (activeOnly && !r.isActive) return false
        if (kinds.length > 0 && !kinds.includes(r.kind)) return false
        if (category && r.categoryName !== category) return false
        if (brand && r.brandName !== brand) return false

        if (stock !== 'all') {
          if (!r.trackInventory) return false
          const onHand = Number(r.onHand ?? 0)
          if (stock === 'out' && onHand > 0) return false
          if (stock === 'low') {
            const min = Number(r.minQuantity ?? 0)
            if (!(min > 0 && onHand <= min)) return false
          }
        }

        if (search) {
          const haystack = [r.code, r.name, r.categoryName, r.brandName].filter(Boolean).join(' ')
          if (!matchesSearch(haystack, search)) return false
        }
        return true
      }),
    [rows, activeOnly, kinds, category, brand, stock, search],
  )

  const paged = useMemo(() => {
    const start = (pagination.page - 1) * pagination.pageSize
    return filtered.slice(start, start + pagination.pageSize)
  }, [filtered, pagination])

  /** Tổng giá trị tồn kho theo giá vốn — chỉ có nghĩa với hàng vật lý. */
  const summary = useMemo(() => {
    let stockValue = 0
    let stockUnits = 0
    for (const r of filtered) {
      if (!r.trackInventory) continue
      const onHand = Number(r.onHand ?? 0)
      stockUnits += onHand
      stockValue += onHand * Number(r.cost ?? 0)
    }
    return { stockValue, stockUnits }
  }, [filtered])

  const columns = useMemo<ColumnDef<ProductRow, unknown>[]>(() => {
    const cols: ColumnDef<ProductRow, unknown>[] = [
      { accessorKey: 'code', header: 'Mã hàng' },
      {
        accessorKey: 'name',
        header: 'Tên hàng',
        cell: (c) => {
          const r = c.row.original
          return (
            <div className="min-w-[16rem]">
              <div className="font-medium">{r.name}</div>
              <div className="text-muted-foreground mt-0.5 text-xs">
                {/* Mỗi loại có một thông tin đặc trưng đáng hiện ngay dưới tên */}
                {r.kind === 'service' && r.durationMinutes && (
                  <>Thời lượng {formatDuration(r.durationMinutes)}</>
                )}
                {r.kind === 'card' && (
                  <>
                    Mệnh giá {formatMoney(r.cardFaceValue)}
                    {Number(r.cardBonusValue ?? 0) > 0 && (
                      <> · tặng {formatMoney(r.cardBonusValue)}</>
                    )}
                  </>
                )}
                {(r.kind === 'package' || r.kind === 'card') && (
                  <> · {formatValidity(r.validityType, r.validityValue)}</>
                )}
                {r.kind === 'product' && r.brandName}
              </div>
            </div>
          )
        },
      },
      {
        accessorKey: 'kind',
        header: 'Loại',
        cell: (c) => {
          const k = c.getValue<ProductKind>()
          return <Badge tone={KIND_TONE[k]}>{KIND_LABEL[k]}</Badge>
        },
      },
      { accessorKey: 'categoryName', header: 'Nhóm hàng', cell: (c) => c.getValue<string>() ?? '—' },
      {
        accessorKey: 'basePrice',
        header: 'Giá bán',
        cell: (c) => <span className="tabular block text-right">{formatMoney(c.getValue<string>())}</span>,
      },
    ]

    if (showCost) {
      cols.push({
        accessorKey: 'cost',
        header: 'Giá vốn',
        cell: (c) => (
          <span className="tabular text-muted-foreground block text-right">
            {formatMoney(c.getValue<string>())}
          </span>
        ),
      })
    }

    cols.push(
      {
        accessorKey: 'onHand',
        header: 'Tồn kho',
        cell: (c) => {
          const r = c.row.original
          if (!r.trackInventory) return <span className="text-muted-foreground block text-right">—</span>
          const onHand = Number(r.onHand ?? 0)
          const min = Number(r.minQuantity ?? 0)
          const low = min > 0 && onHand <= min
          return (
            <span
              className={`tabular block text-right ${low ? 'text-warning font-medium' : ''}`}
              title={low ? `Dưới định mức tối thiểu (${formatQuantity(min)})` : undefined}
            >
              {formatQuantity(onHand)}
            </span>
          )
        },
      },
      { accessorKey: 'unitName', header: 'Đơn vị', cell: (c) => c.getValue<string>() ?? '—' },
      {
        accessorKey: 'isActive',
        header: 'Trạng thái',
        cell: (c) =>
          c.getValue<boolean>() ? (
            <Badge tone="success">Đang bán</Badge>
          ) : (
            <Badge>Ngừng bán</Badge>
          ),
      },
    )

    return cols
  }, [showCost])

  const activeFilterCount =
    kinds.length + (category ? 1 : 0) + (brand ? 1 : 0) + (stock !== 'all' ? 1 : 0) + (activeOnly ? 0 : 1)

  return (
    <DataTable
      columns={columns}
      data={paged}
      total={filtered.length}
      pagination={pagination}
      onPaginationChange={setPagination}
      storageKey="products"
      search={{
        value: search,
        onChange: (v) => {
          setSearch(v)
          resetPage()
        },
        placeholder: 'Tìm theo mã, tên hàng…',
      }}
      activeFilterCount={activeFilterCount}
      onClearFilters={() => {
        setKinds([])
        setCategory('')
        setBrand('')
        setStock('all')
        setActiveOnly(true)
        resetPage()
      }}
      filters={
        <>
          <FilterGroup label="Loại hàng">
            <CheckboxFilter
              values={kinds}
              onChange={(v) => {
                setKinds(v)
                resetPage()
              }}
              options={kindOptions}
            />
          </FilterGroup>

          <FilterGroup label="Nhóm hàng">
            <SelectFilter
              value={category}
              onChange={(v) => {
                setCategory(v)
                resetPage()
              }}
              options={categoryOptions}
            />
          </FilterGroup>

          {brandOptions.length > 0 && (
            <FilterGroup label="Thương hiệu">
              <SelectFilter
                value={brand}
                onChange={(v) => {
                  setBrand(v)
                  resetPage()
                }}
                options={brandOptions}
              />
            </FilterGroup>
          )}

          <FilterGroup label="Tồn kho">
            <RadioFilter
              name="stock"
              value={stock}
              onChange={(v) => {
                setStock(v)
                resetPage()
              }}
              options={[
                { value: 'all', label: 'Tất cả' },
                { value: 'low', label: 'Dưới định mức' },
                { value: 'out', label: 'Hết hàng' },
              ]}
            />
          </FilterGroup>

          <FilterGroup label="Trạng thái">
            <RadioFilter
              name="active"
              value={activeOnly ? 'active' : 'all'}
              onChange={(v) => {
                setActiveOnly(v === 'active')
                resetPage()
              }}
              options={[
                { value: 'active', label: 'Đang bán' },
                { value: 'all', label: 'Tất cả' },
              ]}
            />
          </FilterGroup>
        </>
      }
      summaryRow={
        summary.stockUnits > 0 ? (
          <>
            <td className="px-3 py-2" colSpan={showCost ? 5 : 4}>
              <span className="text-muted-foreground">Tổng tồn kho</span>
            </td>
            <td className="tabular px-3 py-2 text-right">
              {formatQuantity(summary.stockUnits)}
            </td>
            <td className="text-muted-foreground px-3 py-2 text-sm" colSpan={2}>
              giá trị {formatMoney(summary.stockValue)}
            </td>
          </>
        ) : undefined
      }
      exportConfig={{
        fileNamePrefix: 'hang-hoa',
        columns: [
          { header: 'Mã hàng', value: (r) => r.code },
          { header: 'Tên hàng', value: (r) => r.name },
          { header: 'Loại', value: (r) => KIND_LABEL[r.kind] },
          { header: 'Nhóm hàng', value: (r) => r.categoryName },
          { header: 'Thương hiệu', value: (r) => r.brandName },
          { header: 'Đơn vị', value: (r) => r.unitName },
          { header: 'Giá bán', value: (r) => r.basePrice },
          ...(showCost ? [{ header: 'Giá vốn', value: (r: ProductRow) => r.cost }] : []),
          { header: 'Thời lượng (phút)', value: (r) => r.durationMinutes },
          { header: 'Tồn kho', value: (r) => (r.trackInventory ? (r.onHand ?? '0') : '') },
          { header: 'Trạng thái', value: (r) => (r.isActive ? 'Đang bán' : 'Ngừng bán') },
        ],
      }}
      mobileCard={(r) => (
        <div className="space-y-1.5">
          <div className="flex items-start justify-between gap-3">
            <span className="font-medium">{r.name}</span>
            <Badge tone={KIND_TONE[r.kind]}>{KIND_LABEL[r.kind]}</Badge>
          </div>
          <div className="text-muted-foreground flex flex-wrap gap-x-3 text-sm">
            <span>{r.code}</span>
            {r.kind === 'service' && r.durationMinutes && (
              <span>{formatDuration(r.durationMinutes)}</span>
            )}
            {r.trackInventory && <span>Tồn {formatQuantity(r.onHand ?? 0)}</span>}
          </div>
          <div className="tabular font-medium">{formatMoney(r.basePrice)} đ</div>
        </div>
      )}
      emptyMessage="Chưa có hàng hoá nào"
    />
  )
}
