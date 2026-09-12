'use client'

import { useMemo, useState, useTransition } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { DataTable, type PaginationState } from '@/components/data-table/data-table'
import { Badge, FilterGroup, RadioFilter } from '@/components/data-table/filters'
import { INVOICE_STATUS_LABEL, PAYMENT_METHOD_LABEL } from '@/lib/schema'
import { formatDateTime, formatMoney, matchesSearch } from '@/lib/format'

export interface InvoiceRow {
  id: string
  code: string
  status: 'draft' | 'completed' | 'cancelled'
  issuedAt: Date
  /** `customers.name`, null thì `guestName`, vẫn null thì 'Khách lẻ' — đã gộp ở page.tsx. */
  customerName: string
  subtotal: string
  discountAmount: string
  total: string
  /** §3b.5 — giá trị buổi dùng từ gói. KHÔNG phải doanh thu, chỉ hiện riêng. */
  serviceAllocatedValue: string
  paidAmount: string
  itemCount: number
  /** "cash, bank" từ string_agg — null khi hoá đơn chưa có phiếu thu nào. */
  paymentMethods: string | null
}

const STATUS_TONE: Record<InvoiceRow['status'], 'success' | 'neutral' | 'danger'> = {
  completed: 'success',
  draft: 'neutral',
  cancelled: 'danger',
}

type StatusFilter = 'all' | 'completed' | 'draft' | 'cancelled'
type ShortageFilter = 'all' | 'short'

/** "cash, bank" -> "Tiền mặt, Chuyển khoản" để hiện tiếng Việt cho người dùng. */
function formatPaymentMethods(raw: string): string {
  return raw
    .split(', ')
    .map((m) => PAYMENT_METHOD_LABEL[m] ?? m)
    .join(', ')
}

import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { cancelInvoiceAction } from './actions'

export function InvoiceTable({
  rows,
  canManage,
}: {
  rows: InvoiceRow[]
  /** Quyền huỷ hoá đơn (`invoice.return`) — quyết định có hiện nút Huỷ không. */
  canManage: boolean
}) {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [shortage, setShortage] = useState<ShortageFilter>('all')
  const [pagination, setPagination] = useState<PaginationState>({ page: 1, pageSize: 20 })

  const resetPage = () => setPagination((p) => ({ ...p, page: 1 }))

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (status !== 'all' && r.status !== status) return false
        if (shortage === 'short' && Number(r.paidAmount) >= Number(r.total)) return false
        if (search) {
          const haystack = [r.code, r.customerName].filter(Boolean).join(' ')
          if (!matchesSearch(haystack, search)) return false
        }
        return true
      }),
    [rows, status, shortage, search],
  )

  const paged = useMemo(() => {
    const start = (pagination.page - 1) * pagination.pageSize
    return filtered.slice(start, start + pagination.pageSize)
  }, [filtered, pagination])

  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [cancelling, setCancelling] = useState<InvoiceRow | null>(null)
  const [cancelNote, setCancelNote] = useState('')
  const [cancelError, setCancelError] = useState('')
  const [cancelDone, setCancelDone] = useState('')

  const columns = useMemo<ColumnDef<InvoiceRow, unknown>[]>(
    () => [
      {
        accessorKey: 'code',
        header: 'Mã hoá đơn',
        cell: (c) => {
          const row = c.row.original
          return (
            <div>
              <div className="font-medium">{row.code}</div>
              {Number(row.serviceAllocatedValue) > 0 && (
                <div className="text-muted-foreground text-xs">
                  có {formatMoney(row.serviceAllocatedValue)} buổi dùng từ gói
                </div>
              )}
            </div>
          )
        },
      },
      {
        accessorKey: 'issuedAt',
        header: 'Thời gian',
        cell: (c) => (
          <span className="tabular whitespace-nowrap">{formatDateTime(c.getValue<Date>())}</span>
        ),
      },
      {
        accessorKey: 'customerName',
        header: 'Khách hàng',
        cell: (c) => <span className="font-medium">{c.getValue<string>()}</span>,
      },
      {
        accessorKey: 'itemCount',
        header: 'Số dòng',
        cell: (c) => <span className="tabular">{c.getValue<number>()}</span>,
      },
      {
        accessorKey: 'subtotal',
        header: 'Tổng tiền hàng',
        cell: (c) => <span className="tabular">{formatMoney(c.getValue<string>())}</span>,
      },
      {
        accessorKey: 'discountAmount',
        header: 'Giảm giá',
        cell: (c) => <span className="tabular">{formatMoney(c.getValue<string>())}</span>,
      },
      {
        accessorKey: 'total',
        header: 'Khách cần trả',
        cell: (c) => (
          <span className="tabular font-medium">{formatMoney(c.getValue<string>())}</span>
        ),
      },
      {
        accessorKey: 'paidAmount',
        header: 'Đã thu',
        cell: (c) => {
          const row = c.row.original
          const missing = Number(row.total) - Number(row.paidAmount)
          return (
            <div>
              <div className="flex items-center gap-1.5">
                <span className="tabular">{formatMoney(row.paidAmount)}</span>
                {missing > 0 && <Badge tone="warning">Thiếu {formatMoney(missing)}</Badge>}
              </div>
              {row.paymentMethods && (
                <div className="text-muted-foreground text-xs">
                  {formatPaymentMethods(row.paymentMethods)}
                </div>
              )}
            </div>
          )
        },
      },
      {
        accessorKey: 'status',
        header: 'Trạng thái',
        cell: (c) => {
          const value = c.getValue<InvoiceRow['status']>()
          return <Badge tone={STATUS_TONE[value]}>{INVOICE_STATUS_LABEL[value]}</Badge>
        },
      },
      ...(canManage
        ? [
            {
              id: 'actions',
              header: '',
              cell: ({ row }: { row: { original: InvoiceRow } }) =>
                row.original.status === 'cancelled' ? null : (
                  <button
                    type="button"
                    onClick={() => {
                      setCancelling(row.original)
                      setCancelNote('')
                      setCancelError('')
                    }}
                    className="text-danger text-sm hover:underline"
                  >
                    Huỷ
                  </button>
                ),
            } as ColumnDef<InvoiceRow, unknown>,
          ]
        : []),
    ],
    [canManage],
  )

  // `total` là doanh thu thật. `serviceAllocatedValue` (giá trị buổi khách dùng
  // từ gói) KHÔNG được cộng vào đây — tiền đó đã thu từ hôm bán gói, cộng nữa
  // là đếm hai lần (AGENTS.md §3b.5). Hiện riêng ở dòng tổng, không gộp chung.
  const totalRevenue = filtered.reduce((s, r) => s + Number(r.total), 0)
  const totalPaid = filtered.reduce((s, r) => s + Number(r.paidAmount), 0)
  const totalServiceAllocated = filtered.reduce((s, r) => s + Number(r.serviceAllocatedValue), 0)
  const activeFilterCount = (status !== 'all' ? 1 : 0) + (shortage !== 'all' ? 1 : 0)

  return (
    <>
      <DataTable
        columns={columns}
        data={paged}
        total={filtered.length}
        pagination={pagination}
        onPaginationChange={setPagination}
        storageKey="invoices"
        summaryRow={
          // `DataTable` đặt thẳng nội dung này vào một `<tr>`, nên phải là ô
          // `<td>` trải hết bảng — trả về `<span>` thì trình duyệt nhét vào cột
          // đầu và câu tổng bị bó trong bề rộng cột "Mã hoá đơn".
          <td className="text-muted-foreground px-3 py-2 text-sm" colSpan={columns.length}>
            {filtered.length} hoá đơn · doanh thu{' '}
            <strong className="text-foreground font-medium">{formatMoney(totalRevenue)}</strong> ·
            đã thu <strong className="text-foreground font-medium">{formatMoney(totalPaid)}</strong>
            {totalServiceAllocated > 0 && (
              <>
                {' · '}
                {formatMoney(totalServiceAllocated)} giá trị buổi dùng từ gói (không tính doanh thu)
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
          placeholder: 'Tìm theo mã hoá đơn, tên khách…',
        }}
        activeFilterCount={activeFilterCount}
        onClearFilters={() => {
          setStatus('all')
          setShortage('all')
        }}
        filters={
          <>
            <FilterGroup label="Trạng thái">
              <RadioFilter
                name="inv-status"
                value={status}
                onChange={(v) => {
                  setStatus(v)
                  resetPage()
                }}
                options={[
                  { value: 'all', label: 'Tất cả' },
                  { value: 'completed', label: 'Hoàn thành' },
                  { value: 'draft', label: 'Đang bán' },
                  { value: 'cancelled', label: 'Đã huỷ' },
                ]}
              />
            </FilterGroup>

            <FilterGroup label="Chỉ hoá đơn còn thiếu tiền">
              <RadioFilter
                name="inv-shortage"
                value={shortage}
                onChange={(v) => {
                  setShortage(v)
                  resetPage()
                }}
                options={[
                  { value: 'all', label: 'Tất cả' },
                  { value: 'short', label: 'Còn thiếu' },
                ]}
              />
            </FilterGroup>
          </>
        }
        exportConfig={{
          fileNamePrefix: 'hoa-don',
          columns: [
            { header: 'Mã hoá đơn', value: (r) => r.code },
            { header: 'Thời gian', value: (r) => formatDateTime(r.issuedAt) },
            { header: 'Khách hàng', value: (r) => r.customerName },
            { header: 'Số dòng', value: (r) => r.itemCount },
            { header: 'Tổng tiền hàng', value: (r) => r.subtotal },
            { header: 'Giảm giá', value: (r) => r.discountAmount },
            { header: 'Khách cần trả', value: (r) => r.total },
            { header: 'Đã thu', value: (r) => r.paidAmount },
            { header: 'Giá trị buổi dùng từ gói', value: (r) => r.serviceAllocatedValue },
            {
              header: 'Phương thức thanh toán',
              value: (r) => (r.paymentMethods ? formatPaymentMethods(r.paymentMethods) : ''),
            },
            { header: 'Trạng thái', value: (r) => INVOICE_STATUS_LABEL[r.status] },
          ],
        }}
        mobileCard={(r) => (
          <div className="space-y-1">
            <div className="flex items-start justify-between gap-3">
              <span className="font-medium">{r.code}</span>
              <Badge tone={STATUS_TONE[r.status]}>{INVOICE_STATUS_LABEL[r.status]}</Badge>
            </div>
            <p className="text-muted-foreground text-sm">
              {r.customerName}
              <span className="tabular"> · {formatMoney(r.total)}</span>
            </p>
          </div>
        )}
        emptyMessage="Chưa có hoá đơn nào"
      />

      {cancelling && (
        <div className="bg-foreground/40 fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="bg-card w-full max-w-md rounded-lg p-5 shadow-lg">
            <h2 className="font-semibold">Huỷ hoá đơn {cancelling.code}?</h2>
            {/*
            Nói rõ việc gì sắp xảy ra trước khi nó xảy ra. Huỷ hoá đơn không
            xoá gì cả: buổi khách đã dùng được hoàn lại bằng một bút toán
            ngược, tiền đã thu được đảo bằng một phiếu chi, và cả hai vế đều
            còn nguyên trong lịch sử.
          */}
            <p className="text-muted-foreground mt-2 text-sm">
              Hoá đơn được đánh dấu đã huỷ, không bị xoá. Buổi khách đã dùng sẽ được hoàn lại vào
              gói, và tiền đã thu được đảo bằng một phiếu chi trong sổ quỹ.
            </p>

            {cancelError && (
              <p
                role="alert"
                className="text-danger bg-danger/10 mt-3 rounded-md px-3 py-2 text-sm"
              >
                {cancelError}
              </p>
            )}

            <textarea
              value={cancelNote}
              onChange={(e) => setCancelNote(e.target.value)}
              rows={2}
              placeholder="Lý do huỷ (bắt buộc)…"
              className="border-border mt-3 w-full rounded-md border px-3 py-2 text-sm"
            />

            <div className="mt-4 flex gap-2">
              <Button variant="outline" onClick={() => setCancelling(null)} disabled={pending}>
                Thôi
              </Button>
              <Button
                variant="danger"
                className="flex-1"
                disabled={pending || !cancelNote.trim()}
                onClick={() =>
                  startTransition(async () => {
                    setCancelError('')
                    const result = await cancelInvoiceAction(cancelling.id, cancelNote)
                    if (!result.ok) {
                      setCancelError(result.error ?? 'Không huỷ được.')
                      return
                    }
                    setCancelDone(
                      `Đã huỷ ${cancelling.code}` +
                        (result.restoredSessions ? ` · hoàn ${result.restoredSessions} buổi` : ''),
                    )
                    setCancelling(null)
                    router.refresh()
                  })
                }
              >
                {pending ? 'Đang huỷ…' : 'Xác nhận huỷ'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {cancelDone && (
        <p className="text-success bg-success/10 mt-3 rounded-md px-4 py-2 text-sm">{cancelDone}</p>
      )}
    </>
  )
}
