'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Plus, Search, Trash2, X } from 'lucide-react'
import { Sheet, SheetContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatDuration, formatMoney, formatPhone, matchesSearch } from '@/lib/format'
import { DEFAULT_DURATION_MINUTES, totalSpanMinutes } from '@/lib/bookings/schedule'
import { createBookingAction } from './actions'

export interface CustomerOption {
  id: string
  code: string
  name: string
  phone: string | null
}
export interface ServiceOption {
  id: string
  name: string
  durationMinutes: number | null
  basePrice: string
}
export interface NamedOption {
  id: string
  name: string
}

export interface BookingOptions {
  customers: CustomerOption[]
  services: ServiceOption[]
  rooms: NamedOption[]
  employees: NamedOption[]
  bufferMinutes: number
  slotMinutes: number
}

/**
 * Buổi trong ngày, đúng cách KiotViet chia (`docs/research/03-ux-flows.md` §1).
 * Người ở quầy nghĩ theo "sáng / chiều / tối" chứ không cuộn một danh sách 48
 * mốc giờ, nên bước chọn giờ chia nhóm thay vì đổ phẳng.
 */
const PERIODS = [
  { label: 'Sáng', icon: '🌅', from: 8 * 60, to: 14 * 60 },
  { label: 'Chiều', icon: '🌤', from: 14 * 60, to: 19 * 60 },
  { label: 'Tối', icon: '☀️', from: 19 * 60, to: 24 * 60 },
  { label: 'Đêm', icon: '🌙', from: 0, to: 8 * 60 },
]

const TZ_OFFSET_MINUTES = 7 * 60
const DAY_MS = 86_400_000

const hhmm = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

function isoDateVN(d: Date) {
  return new Date(d.getTime() + TZ_OFFSET_MINUTES * 60_000).toISOString().slice(0, 10)
}

/** Ghép `YYYY-MM-DD` + phút trong ngày thành mốc thật, hiểu theo giờ Việt Nam. */
function toInstant(isoDate: string, minute: number): Date {
  const [y, m, d] = isoDate.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, 0, 0) + (minute - TZ_OFFSET_MINUTES) * 60_000)
}

function prettyDate(isoDate: string) {
  const [y, m, d] = isoDate.split('-')
  return `${d}/${m}/${y}`
}

interface PickedService {
  key: number
  serviceId: string
  roomId: string
  performerEmployeeId: string
}

export function BookingPanel({
  open,
  onOpenChange,
  options,
  todayISO,
  initialDate,
  initialMinute,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  options: BookingOptions
  /** Hôm nay theo giờ Việt Nam, tính ở máy chủ. */
  todayISO: string
  initialDate: string
  /** Giờ người dùng bấm trên lưới, nếu có — bỏ qua bước chọn giờ cho nhanh. */
  initialMinute: number | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [step, setStep] = useState<1 | 2>(initialMinute == null ? 1 : 2)
  const [date, setDate] = useState(initialDate)
  const [minute, setMinute] = useState<number | null>(initialMinute)

  const [customerId, setCustomerId] = useState('')
  const [guestName, setGuestName] = useState('')
  const [search, setSearch] = useState('')
  const [note, setNote] = useState('')
  const [picked, setPicked] = useState<PickedService[]>([])
  const [error, setError] = useState('')

  const step2Ready = minute != null

  const reset = () => {
    setStep(1)
    setMinute(null)
    setCustomerId('')
    setGuestName('')
    setSearch('')
    setNote('')
    setPicked([])
    setError('')
  }

  const close = (next: boolean) => {
    if (!next) reset()
    onOpenChange(next)
  }

  const serviceById = useMemo(
    () => new Map(options.services.map((s) => [s.id, s])),
    [options.services],
  )

  const matched = useMemo(() => {
    if (!search.trim()) return options.customers.slice(0, 8)
    return options.customers
      .filter((c) => matchesSearch([c.code, c.name, c.phone].filter(Boolean).join(' '), search))
      .slice(0, 8)
  }, [options.customers, search])

  const chosen = options.customers.find((c) => c.id === customerId)

  const totalMinutes = totalSpanMinutes(
    picked.map((p) => ({
      serviceId: p.serviceId,
      serviceName: '',
      durationMinutes: serviceById.get(p.serviceId)?.durationMinutes ?? null,
    })),
    options.bufferMinutes,
  )
  const totalPrice = picked.reduce(
    (sum, p) => sum + Number(serviceById.get(p.serviceId)?.basePrice ?? 0),
    0,
  )

  const submit = () => {
    setError('')
    if (minute == null) return
    startTransition(async () => {
      const result = await createBookingAction({
        customerId: customerId || undefined,
        guestName: customerId ? undefined : guestName.trim() || undefined,
        startsAt: toInstant(date, minute).toISOString(),
        note: note.trim() || undefined,
        services: picked.map((p) => ({
          serviceId: p.serviceId,
          roomId: p.roomId || undefined,
          performerEmployeeId: p.performerEmployeeId || undefined,
        })),
      })
      if (!result.ok) {
        setError(result.error ?? 'Không lưu được lịch hẹn.')
        return
      }
      close(false)
      router.refresh()
    })
  }

  const today = todayISO
  const tomorrow = isoDateVN(new Date(new Date(`${todayISO}T00:00:00Z`).getTime() + DAY_MS))

  return (
    <Sheet open={open} onOpenChange={close}>
      <SheetContent
        title={step === 1 ? 'Chọn thời gian' : 'Lịch hẹn'}
        description={
          step === 2 && minute != null
            ? `${hhmm(minute)}, ${prettyDate(date)}`
            : 'Chọn ngày và khung giờ bắt đầu'
        }
        className="max-w-md"
        footer={
          step === 1 ? (
            <Button className="w-full" disabled={!step2Ready} onClick={() => setStep(2)}>
              Tiếp tục
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(1)} disabled={pending}>
                Đổi giờ
              </Button>
              <Button
                className="flex-1"
                onClick={submit}
                disabled={pending || picked.length === 0 || (!customerId && !guestName.trim())}
              >
                {pending ? 'Đang lưu…' : 'Lưu lịch hẹn'}
              </Button>
            </div>
          )
        }
      >
        {step === 1 ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {[
                { label: 'Hôm nay', value: today },
                { label: 'Ngày mai', value: tomorrow },
              ].map((chip) => (
                <Button
                  key={chip.value}
                  size="sm"
                  variant={date === chip.value ? 'primary' : 'outline'}
                  onClick={() => setDate(chip.value)}
                >
                  {chip.label}
                </Button>
              ))}
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                aria-label="Ngày khác"
                className="border-border rounded-md border px-3 py-1.5 text-sm"
              />
            </div>

            {PERIODS.map((period) => {
              const slots: number[] = []
              for (let m = period.from; m < period.to; m += options.slotMinutes) slots.push(m)
              return (
                <div key={period.label}>
                  <p className="text-muted-foreground mb-1.5 text-sm">
                    {period.icon} {period.label}{' '}
                    <span className="text-xs">
                      {hhmm(period.from)}–{hhmm(period.to % (24 * 60))}
                    </span>
                  </p>
                  <div className="grid grid-cols-4 gap-1.5">
                    {slots.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setMinute(m)}
                        className={cn(
                          'rounded-md border py-1.5 text-sm tabular-nums',
                          minute === m
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border hover:bg-muted',
                        )}
                      >
                        {hhmm(m)}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="space-y-4">
            {error && (
              <p role="alert" className="text-danger bg-danger/10 rounded-md px-4 py-3 text-sm">
                {error}
              </p>
            )}

            <div>
              <p className="mb-1.5 text-sm font-medium">Khách hàng</p>
              {chosen ? (
                <div className="border-border flex items-center justify-between gap-2 rounded-md border px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{chosen.name}</p>
                    <p className="text-muted-foreground truncate text-xs">
                      {chosen.code}
                      {chosen.phone && ` · ${formatPhone(chosen.phone)}`}
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
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Tìm theo mã, tên, số điện thoại…"
                      className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none"
                    />
                  </div>
                  {matched.length > 0 && (
                    <ul className="border-border mt-1.5 max-h-44 overflow-y-auto rounded-md border">
                      {matched.map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            onClick={() => setCustomerId(c.id)}
                            className="hover:bg-muted w-full px-3 py-2 text-left text-sm"
                          >
                            <span className="font-medium">{c.name}</span>
                            <span className="text-muted-foreground">
                              {' '}
                              · {c.code}
                              {c.phone && ` · ${formatPhone(c.phone)}`}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {/*
                    Khách vãng lai chưa có hồ sơ vẫn phải đặt được — quầy lễ tân
                    không dừng lại để lập hồ sơ khi khách đang đứng đợi.
                  */}
                  <input
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    placeholder="…hoặc gõ tên khách vãng lai"
                    className="border-border mt-1.5 w-full rounded-md border px-3 py-2 text-sm"
                  />
                </>
              )}
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <p className="text-sm font-medium">Dịch vụ</p>
                {picked.length > 0 && (
                  <p className="text-muted-foreground text-xs">
                    {formatDuration(totalMinutes)} · {formatMoney(totalPrice)}
                  </p>
                )}
              </div>

              {picked.length === 0 && (
                <p className="text-muted-foreground border-border rounded-md border border-dashed px-3 py-4 text-center text-sm">
                  Chưa có dịch vụ nào
                </p>
              )}

              <ul className="space-y-2">
                {picked.map((p, i) => (
                  <li key={p.key} className="border-border space-y-1.5 rounded-md border p-2.5">
                    <div className="flex items-start gap-2">
                      <select
                        value={p.serviceId}
                        onChange={(e) =>
                          setPicked((list) =>
                            list.map((x) =>
                              x.key === p.key ? { ...x, serviceId: e.target.value } : x,
                            ),
                          )
                        }
                        className="border-border min-w-0 flex-1 rounded-md border px-2 py-1.5 text-sm"
                      >
                        {options.services.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Bỏ dịch vụ"
                        onClick={() => setPicked((list) => list.filter((x) => x.key !== p.key))}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>

                    <div className="flex gap-1.5">
                      <select
                        value={p.roomId}
                        onChange={(e) =>
                          setPicked((list) =>
                            list.map((x) =>
                              x.key === p.key ? { ...x, roomId: e.target.value } : x,
                            ),
                          )
                        }
                        className="border-border min-w-0 flex-1 rounded-md border px-2 py-1.5 text-sm"
                      >
                        <option value="">
                          {options.rooms.length === 0 ? 'Chưa khai phòng nào' : 'Chưa chọn phòng'}
                        </option>
                        {options.rooms.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                      <select
                        value={p.performerEmployeeId}
                        onChange={(e) =>
                          setPicked((list) =>
                            list.map((x) =>
                              x.key === p.key ? { ...x, performerEmployeeId: e.target.value } : x,
                            ),
                          )
                        }
                        className="border-border min-w-0 flex-1 rounded-md border px-2 py-1.5 text-sm"
                      >
                        <option value="">Chưa chọn KTV</option>
                        {options.employees.map((e2) => (
                          <option key={e2.id} value={e2.id}>
                            {e2.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <p className="text-muted-foreground text-xs">
                      {formatDuration(
                        serviceById.get(p.serviceId)?.durationMinutes ?? DEFAULT_DURATION_MINUTES,
                      )}
                      {i > 0 && options.bufferMinutes > 0 && (
                        <> · cách buổi trước {options.bufferMinutes} phút</>
                      )}
                    </p>
                  </li>
                ))}
              </ul>

              <Button
                variant="outline"
                className="mt-2 w-full"
                disabled={options.services.length === 0}
                onClick={() =>
                  setPicked((list) => [
                    ...list,
                    {
                      key: Date.now() + list.length,
                      serviceId: options.services[0].id,
                      roomId: '',
                      performerEmployeeId: '',
                    },
                  ])
                }
              >
                <Plus className="size-4" /> Thêm dịch vụ
              </Button>
            </div>

            <div>
              <p className="mb-1.5 text-sm font-medium">Ghi chú</p>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="Khách dặn gì, cần chuẩn bị gì…"
                className="border-border w-full rounded-md border px-3 py-2 text-sm"
              />
            </div>

            {minute != null && picked.length > 0 && (
              <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
                <Check className="text-success size-4" />
                Xong lúc {hhmm((minute + totalMinutes) % (24 * 60))}
              </p>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
