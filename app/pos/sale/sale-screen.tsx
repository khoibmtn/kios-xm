'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Minus, Plus, Search, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatMoney, formatPhone, matchesSearch } from '@/lib/format'
import { checkoutAction } from './actions'

export interface SaleProduct {
  id: string
  code: string
  name: string
  kind: 'product' | 'service' | 'package' | 'card'
  basePrice: string
  unitName: string | null
}
export interface SaleCustomer {
  id: string
  code: string
  name: string
  phone: string | null
}
/** Buổi khách còn trong gói — bán ra thì trừ buổi thay vì thu tiền. */
export interface SessionOption {
  itemId: string
  customerId: string
  serviceId: string
  serviceName: string
  remaining: number
  packageName: string
}

interface Line {
  key: number
  product: SaleProduct
  quantity: number
  unitPrice: number
  discountAmount: number
  /** Khác null nghĩa là dòng này trừ buổi từ gói, không thu tiền. */
  packageItemId: string | null
}

const KIND_LABEL: Record<string, string> = {
  product: 'Sản phẩm',
  service: 'Dịch vụ',
  package: 'Gói',
  card: 'Thẻ',
}

const METHODS = [
  { value: 'cash', label: 'Tiền mặt' },
  { value: 'bank', label: 'Chuyển khoản' },
  { value: 'wallet', label: 'Ví điện tử' },
] as const

export function SaleScreen({
  products,
  customers,
  sessions,
}: {
  products: SaleProduct[]
  customers: SaleCustomer[]
  sessions: SessionOption[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [search, setSearch] = useState('')
  const [kind, setKind] = useState<'all' | 'product' | 'service' | 'package'>('all')
  const [lines, setLines] = useState<Line[]>([])
  const [customerId, setCustomerId] = useState('')
  const [customerSearch, setCustomerSearch] = useState('')
  const [guestName, setGuestName] = useState('')
  const [invoiceDiscount, setInvoiceDiscount] = useState(0)
  const [method, setMethod] = useState<'cash' | 'bank' | 'wallet'>('cash')
  const [error, setError] = useState('')
  const [done, setDone] = useState<string | null>(null)

  const customer = customers.find((c) => c.id === customerId)

  const visible = useMemo(
    () =>
      products
        .filter((p) => (kind === 'all' ? p.kind !== 'card' : p.kind === kind))
        .filter((p) => !search.trim() || matchesSearch(`${p.code} ${p.name}`, search))
        .slice(0, 60),
    [products, kind, search],
  )

  const matchedCustomers = useMemo(
    () =>
      customerSearch.trim()
        ? customers
            .filter((c) =>
              matchesSearch([c.code, c.name, c.phone].filter(Boolean).join(' '), customerSearch),
            )
            .slice(0, 6)
        : [],
    [customers, customerSearch],
  )

  /** Buổi còn lại của đúng khách đang chọn — không chào gói của người khác. */
  const availableSessions = useMemo(
    () => (customerId ? sessions.filter((s) => s.customerId === customerId) : []),
    [sessions, customerId],
  )

  const add = (product: SaleProduct, packageItemId: string | null = null) =>
    setLines((list) => [
      ...list,
      {
        key: Date.now() + list.length,
        product,
        quantity: 1,
        unitPrice: packageItemId ? 0 : Math.round(Number(product.basePrice)),
        discountAmount: 0,
        packageItemId,
      },
    ])

  const patch = (key: number, next: Partial<Line>) =>
    setLines((list) => list.map((l) => (l.key === key ? { ...l, ...next } : l)))

  const subtotal = lines.reduce(
    (s, l) => s + Math.max(0, l.unitPrice - l.discountAmount) * l.quantity,
    0,
  )
  const discount = Math.min(invoiceDiscount, subtotal)
  const total = subtotal - discount
  const sessionLines = lines.filter((l) => l.packageItemId).length

  const reset = () => {
    setLines([])
    setCustomerId('')
    setCustomerSearch('')
    setGuestName('')
    setInvoiceDiscount(0)
    setError('')
  }

  const submit = (withPayment: boolean) =>
    startTransition(async () => {
      setError('')
      const result = await checkoutAction({
        customerId: customerId || undefined,
        guestName: customerId ? undefined : guestName.trim() || undefined,
        invoiceDiscount: discount,
        lines: lines.map((l) => ({
          productId: l.product.id,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          discountAmount: l.discountAmount,
          customerPackageItemId: l.packageItemId ?? undefined,
        })),
        payment: withPayment && total > 0 ? { method, amount: total } : undefined,
      })
      if (!result.ok) {
        setError(result.error ?? 'Không lập được hoá đơn.')
        return
      }
      setDone(result.code ?? '')
      reset()
      router.refresh()
    })

  return (
    <div className="flex h-full min-h-0">
      {/* Bên trái: chọn hàng */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="border-border flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2">
          <div className="border-border flex min-w-48 flex-1 items-center gap-2 rounded-md border px-3">
            <Search className="text-muted-foreground size-4 shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm theo mã hoặc tên hàng…"
              className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none"
            />
          </div>
          <div className="border-border flex overflow-hidden rounded-md border">
            {(['all', 'product', 'service', 'package'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={cn(
                  'px-3 py-1.5 text-sm',
                  kind === k ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
                )}
              >
                {k === 'all' ? 'Tất cả' : KIND_LABEL[k]}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {availableSessions.length > 0 && (
            <div className="border-warning/40 bg-warning/5 mb-3 rounded-md border p-3">
              <p className="text-warning text-sm font-medium">
                Khách còn buổi trong gói — bấm để dùng, không thu tiền
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {availableSessions.map((s) => {
                  const product = products.find((p) => p.id === s.serviceId)
                  const used = lines.filter((l) => l.packageItemId === s.itemId).length
                  return (
                    <button
                      key={s.itemId}
                      type="button"
                      disabled={!product || used >= s.remaining}
                      onClick={() => product && add(product, s.itemId)}
                      className="border-border bg-card hover:bg-muted rounded-md border px-3 py-1.5 text-left text-sm disabled:opacity-50"
                    >
                      {s.serviceName}
                      <span className="text-muted-foreground"> · còn {s.remaining - used}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
            {visible.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => add(p)}
                className="border-border hover:border-primary hover:bg-muted/50 rounded-md border p-2.5 text-left"
              >
                <p className="line-clamp-2 text-sm font-medium">{p.name}</p>
                <p className="text-muted-foreground mt-1 text-xs">
                  {p.code} · {KIND_LABEL[p.kind]}
                </p>
                <p className="text-primary mt-1 text-sm font-medium">{formatMoney(p.basePrice)}</p>
              </button>
            ))}
            {visible.length === 0 && (
              <p className="text-muted-foreground col-span-full py-10 text-center text-sm">
                Không tìm thấy mặt hàng nào.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Bên phải: giỏ hàng */}
      <div className="border-border bg-card flex w-[22rem] shrink-0 flex-col border-l xl:w-96">
        <div className="border-border shrink-0 border-b p-3">
          {customer ? (
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{customer.name}</p>
                <p className="text-muted-foreground truncate text-xs">
                  {customer.code}
                  {customer.phone && ` · ${formatPhone(customer.phone)}`}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Bỏ chọn"
                onClick={() => setCustomerId('')}
              >
                <X className="size-4" />
              </Button>
            </div>
          ) : (
            <>
              <div className="border-border flex items-center gap-2 rounded-md border px-3">
                <Search className="text-muted-foreground size-4 shrink-0" />
                <input
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  placeholder="Tìm khách hàng…"
                  className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none"
                />
              </div>
              {matchedCustomers.length > 0 && (
                <ul className="border-border mt-1.5 max-h-40 overflow-y-auto rounded-md border">
                  {matchedCustomers.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setCustomerId(c.id)
                          setCustomerSearch('')
                        }}
                        className="hover:bg-muted w-full px-3 py-2 text-left text-sm"
                      >
                        {c.name}
                        <span className="text-muted-foreground"> · {c.code}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <input
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                placeholder="…hoặc tên khách vãng lai"
                className="border-border mt-1.5 w-full rounded-md border px-3 py-2 text-sm"
              />
            </>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {lines.length === 0 && (
            <p className="text-muted-foreground py-10 text-center text-sm">
              Bấm vào hàng hoá bên trái để thêm vào hoá đơn.
            </p>
          )}
          <ul className="space-y-2">
            {lines.map((l) => (
              <li key={l.key} className="border-border rounded-md border p-2.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 text-sm font-medium">{l.product.name}</p>
                  <button
                    type="button"
                    aria-label="Bỏ dòng"
                    onClick={() => setLines((list) => list.filter((x) => x.key !== l.key))}
                    className="text-muted-foreground hover:text-danger"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>

                {l.packageItemId ? (
                  <p className="text-warning mt-1 text-xs font-medium">Dùng buổi từ gói · 0đ</p>
                ) : (
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="border-border flex items-center rounded-md border">
                      <button
                        type="button"
                        aria-label="Bớt"
                        className="hover:bg-muted px-2 py-1"
                        onClick={() => patch(l.key, { quantity: Math.max(1, l.quantity - 1) })}
                      >
                        <Minus className="size-3.5" />
                      </button>
                      <span className="tabular w-8 text-center text-sm">{l.quantity}</span>
                      <button
                        type="button"
                        aria-label="Thêm"
                        className="hover:bg-muted px-2 py-1"
                        onClick={() => patch(l.key, { quantity: l.quantity + 1 })}
                      >
                        <Plus className="size-3.5" />
                      </button>
                    </div>
                    <input
                      type="number"
                      min={0}
                      value={l.discountAmount || ''}
                      onChange={(e) =>
                        patch(l.key, { discountAmount: Number(e.target.value) || 0 })
                      }
                      placeholder="Giảm giá"
                      className="border-border tabular w-24 rounded-md border px-2 py-1 text-sm"
                    />
                    <span className="tabular ml-auto text-sm font-medium">
                      {formatMoney(Math.max(0, l.unitPrice - l.discountAmount) * l.quantity)}
                    </span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div className="border-border shrink-0 space-y-2 border-t p-3">
          {error && (
            <p role="alert" className="text-danger bg-danger/10 rounded-md px-3 py-2 text-sm">
              {error}
            </p>
          )}
          {done && (
            <p className="text-success bg-success/10 flex items-center gap-2 rounded-md px-3 py-2 text-sm">
              <Check className="size-4" /> Đã lập hoá đơn {done}
            </p>
          )}

          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Tổng tiền hàng</span>
            <span className="tabular">{formatMoney(subtotal)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Giảm giá hoá đơn</span>
            <input
              type="number"
              min={0}
              value={invoiceDiscount || ''}
              onChange={(e) => setInvoiceDiscount(Number(e.target.value) || 0)}
              placeholder="0"
              className="border-border tabular w-28 rounded-md border px-2 py-1 text-right text-sm"
            />
          </div>
          <div className="flex items-center justify-between font-medium">
            <span>Khách cần trả</span>
            <span className="tabular text-primary text-lg">{formatMoney(total)}</span>
          </div>
          {sessionLines > 0 && (
            <p className="text-muted-foreground text-xs">
              {sessionLines} dòng dùng buổi từ gói — không tính vào doanh thu.
            </p>
          )}

          <div className="border-border flex overflow-hidden rounded-md border">
            {METHODS.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setMethod(m.value)}
                className={cn(
                  'flex-1 py-1.5 text-sm',
                  method === m.value ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
                )}
              >
                {m.label}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={pending || lines.length === 0}
              onClick={() => submit(false)}
            >
              Lưu tạm
            </Button>
            <Button
              className="flex-1"
              disabled={pending || lines.length === 0 || (!customerId && !guestName.trim())}
              onClick={() => submit(true)}
            >
              {pending ? 'Đang lưu…' : total > 0 ? `Thu ${formatMoney(total)}` : 'Hoàn tất'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
