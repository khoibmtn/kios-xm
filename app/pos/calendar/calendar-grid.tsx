'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { BOOKING_STATUS_LABEL } from '@/lib/schema/bookings'
import { BookingPanel, type BookingOptions } from './booking-panel'
import { BookingDetail, type CancelReason } from './booking-detail'
import { moveBookingItemAction } from './actions'

export interface CalendarItem {
  id: string
  bookingId: string
  bookingCode: string
  serviceName: string
  /** ISO — xem lý do ở `page.tsx`. */
  startsAt: string
  endsAt: string
  status: string
  customerName: string
  customerPhone: string | null
  roomName: string | null
  performerName: string | null
}

const TZ_OFFSET_MINUTES = 7 * 60
const DAY_MS = 86_400_000

/** Số phút tính từ 00:00 **giờ Việt Nam** của mốc thời gian đó. */
function minuteOfDayVN(iso: string): number {
  const vn = new Date(new Date(iso).getTime() + TZ_OFFSET_MINUTES * 60_000)
  return vn.getUTCHours() * 60 + vn.getUTCMinutes()
}

function dayIndexVN(iso: string, fromISO: string): number {
  const a = Math.floor((new Date(iso).getTime() + TZ_OFFSET_MINUTES * 60_000) / DAY_MS)
  const b = Math.floor((new Date(fromISO).getTime() + TZ_OFFSET_MINUTES * 60_000) / DAY_MS)
  return a - b
}

const hhmm = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`

const WEEKDAYS = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ nhật']

function ddmm(date: Date) {
  const vn = new Date(date.getTime() + TZ_OFFSET_MINUTES * 60_000)
  return `${String(vn.getUTCDate()).padStart(2, '0')}/${String(vn.getUTCMonth() + 1).padStart(2, '0')}`
}

function isoDate(date: Date) {
  return new Date(date.getTime() + TZ_OFFSET_MINUTES * 60_000).toISOString().slice(0, 10)
}

/** Giờ mở/đóng mặc định của lưới; lịch nằm ngoài khoảng này sẽ nới ra cho vừa. */
const DEFAULT_FROM = 7 * 60
const DEFAULT_TO = 22 * 60
/** Chiều cao một phút, tính bằng px — 48px cho mỗi giờ. */
const PX_PER_MINUTE = 0.8

const STATUS_STYLE: Record<string, string> = {
  scheduled: 'border-border bg-card',
  confirmed: 'border-primary/40 bg-primary/10',
  arrived: 'border-primary bg-primary/15',
  in_progress: 'border-warning bg-warning/15',
  done: 'border-border bg-muted text-muted-foreground',
  no_show: 'border-danger/40 bg-danger/10 line-through',
}

export function CalendarGrid({
  items,
  date,
  view,
  fromISO,
  slotMinutes,
  options,
  canBook,
  todayISO,
  nowMinute,
  cancelReasons,
}: {
  items: CalendarItem[]
  date: string
  view: 'day' | 'week'
  fromISO: string
  slotMinutes: number
  options: BookingOptions
  canBook: boolean
  todayISO: string
  nowMinute: number
  cancelReasons: CancelReason[]
}) {
  const router = useRouter()
  const [panel, setPanel] = useState<{ date: string; minute: number | null } | null>(null)
  const [detail, setDetail] = useState<CalendarItem | null>(null)
  const [, startTransition] = useTransition()

  /*
   * Kéo khối sang giờ khác.
   *
   * Dùng pointer event thay vì HTML drag-and-drop: drag-and-drop gốc không
   * chạy trên cảm ứng, mà quầy lễ tân đứng trước một máy tính bảng. `drag` giữ
   * độ lệch đang kéo để vẽ khối theo ngón tay; con số thật chỉ ghi khi thả.
   */
  const [drag, setDrag] = useState<{ id: string; offsetMinutes: number } | null>(null)
  const dragRef = useRef<{
    id: string
    startY: number
    startMinute: number
    moved: boolean
  } | null>(null)
  const [dragError, setDragError] = useState('')

  /*
   * Lọc theo kỹ thuật viên và phòng giữ ở phía trình duyệt, không đẩy lên URL:
   * đây là cách nhìn tạm của người đang đứng ở quầy, không phải chỗ họ muốn
   * quay lại sau khi tải trang. Ngày và chế độ xem thì ngược lại — chúng ở
   * URL.
   */
  const [performerFilter, setPerformerFilter] = useState('')
  const [roomFilter, setRoomFilter] = useState('')
  const from = useMemo(() => new Date(fromISO), [fromISO])
  const dayCount = view === 'day' ? 1 : 7
  const step = slotMinutes > 0 ? slotMinutes : 30

  const days = useMemo(
    () =>
      Array.from({ length: dayCount }, (_, i) => {
        const d = new Date(from.getTime() + i * DAY_MS)
        return {
          date: d,
          iso: isoDate(d),
          label: WEEKDAYS[(i + (view === 'day' ? weekdayIndex(from) : 0)) % 7],
        }
      }),
    [from, dayCount, view],
  )

  // Nới khung giờ nếu có lịch nằm ngoài 07:00–22:00 — thà lưới dài hơn còn hơn
  // giấu mất một lịch hẹn mà không ai biết.
  const [gridFrom, gridTo] = useMemo(() => {
    let lo = DEFAULT_FROM
    let hi = DEFAULT_TO
    for (const it of items) {
      lo = Math.min(lo, Math.floor(minuteOfDayVN(it.startsAt) / 60) * 60)
      hi = Math.max(hi, Math.ceil(minuteOfDayVN(it.endsAt) / 60) * 60)
    }
    return [Math.max(0, lo), Math.min(24 * 60, Math.max(hi, lo + 60))]
  }, [items])

  const ticks = useMemo(() => {
    const out: number[] = []
    for (let m = gridFrom; m <= gridTo; m += step) out.push(m)
    return out
  }, [gridFrom, gridTo, step])

  /*
   * Khối chồng giờ trong cùng một ngày phải chia nhau bề ngang, không đè lên
   * nhau. Gom thành cụm giao nhau rồi chia đều: đơn giản hơn thuật toán xếp
   * làn của Google Calendar, và với một spa vài lịch mỗi khung giờ thì kết quả
   * nhìn như nhau.
   */
  const shown = useMemo(
    () =>
      items.filter(
        (it) =>
          (!performerFilter || it.performerName === performerFilter) &&
          (!roomFilter || it.roomName === roomFilter),
      ),
    [items, performerFilter, roomFilter],
  )

  const placed = useMemo(() => {
    const byDay = new Map<number, CalendarItem[]>()
    for (const it of shown) {
      const d = dayIndexVN(it.startsAt, fromISO)
      if (d < 0 || d >= dayCount) continue
      byDay.set(d, [...(byDay.get(d) ?? []), it])
    }

    const out: { item: CalendarItem; day: number; lane: number; lanes: number }[] = []
    for (const [day, list] of byDay) {
      const sorted = [...list].sort(
        (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
      )
      let cluster: CalendarItem[] = []
      let clusterEnd = -Infinity

      const flush = () => {
        cluster.forEach((it, i) => out.push({ item: it, day, lane: i, lanes: cluster.length }))
        cluster = []
        clusterEnd = -Infinity
      }

      for (const it of sorted) {
        const s = minuteOfDayVN(it.startsAt)
        const e = minuteOfDayVN(it.endsAt)
        if (cluster.length > 0 && s >= clusterEnd) flush()
        cluster.push(it)
        clusterEnd = Math.max(clusterEnd, e)
      }
      flush()
    }
    return out
  }, [shown, fromISO, dayCount])

  const performers = useMemo(
    () => [...new Set(items.map((i) => i.performerName).filter(Boolean))] as string[],
    [items],
  )
  const roomNames = useMemo(
    () => [...new Set(items.map((i) => i.roomName).filter(Boolean))] as string[],
    [items],
  )

  const go = (nextDate: string, nextView: 'day' | 'week' = view) =>
    router.push(`/pos/calendar?date=${nextDate}&view=${nextView}`)

  const shift = (direction: -1 | 1) =>
    go(isoDate(new Date(from.getTime() + direction * dayCount * DAY_MS)))

  const rangeLabel =
    view === 'day'
      ? `${WEEKDAYS[weekdayIndex(from)]}, ${ddmm(from)}/${yearOf(from)}`
      : `${ddmm(from)} – ${ddmm(new Date(from.getTime() + 6 * DAY_MS))}/${yearOf(from)}`

  const todayIndex = days.findIndex((d) => d.iso === todayISO)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-border flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2">
        <Button variant="outline" size="icon" aria-label="Lùi" onClick={() => shift(-1)}>
          <ChevronLeft className="size-4" />
        </Button>
        <Button variant="outline" size="icon" aria-label="Tiến" onClick={() => shift(1)}>
          <ChevronRight className="size-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={() => go(todayISO)}>
          Hôm nay
        </Button>
        <span className="ml-1 font-medium">{rangeLabel}</span>

        {/*
          Chỉ bày ô lọc khi có từ hai lựa chọn trở lên. Spa hiện có đúng một
          nhân viên và chưa khai phòng nào — một ô lọc chỉ có một lựa chọn là
          thứ chiếm chỗ mà không giúp được gì.
        */}
        {performers.length > 1 && (
          <select
            value={performerFilter}
            onChange={(e) => setPerformerFilter(e.target.value)}
            aria-label="Lọc theo kỹ thuật viên"
            className="border-border rounded-md border px-2 py-1.5 text-sm"
          >
            <option value="">Mọi KTV</option>
            {performers.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        )}
        {roomNames.length > 1 && (
          <select
            value={roomFilter}
            onChange={(e) => setRoomFilter(e.target.value)}
            aria-label="Lọc theo phòng"
            className="border-border rounded-md border px-2 py-1.5 text-sm"
          >
            <option value="">Mọi phòng</option>
            {roomNames.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        )}

        {canBook && (
          <Button size="sm" className="ml-auto" onClick={() => setPanel({ date, minute: null })}>
            <Plus className="size-4" /> Đặt lịch
          </Button>
        )}

        <div
          className={cn(
            'border-border flex overflow-hidden rounded-md border',
            !canBook && 'ml-auto',
          )}
        >
          {(['day', 'week'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => go(date, v)}
              className={cn(
                'px-3 py-1.5 text-sm',
                view === v ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
              )}
            >
              {v === 'day' ? 'Ngày' : 'Tuần'}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <div className="flex min-w-fit">
          <div className="bg-background sticky left-0 z-10 w-14 shrink-0">
            <div className="border-border h-9 border-b" />
            {ticks.slice(0, -1).map((m) => (
              <div
                key={m}
                className="text-muted-foreground relative text-[0.7rem]"
                style={{ height: step * PX_PER_MINUTE }}
              >
                <span className="absolute -top-2 right-1.5 tabular-nums">
                  {m % 60 === 0 ? hhmm(m) : ''}
                </span>
              </div>
            ))}
          </div>

          <div className="flex flex-1">
            {days.map((day, i) => (
              <div
                key={day.iso}
                className={cn(
                  'border-border min-w-[9rem] flex-1 border-l',
                  // Trên điện thoại, chế độ tuần chỉ hiện ngày đang chọn —
                  // bảy cột trên màn hình 375px thì không đọc được gì.
                  view === 'week' && day.iso !== date && 'hidden md:block',
                )}
              >
                <div className="border-border bg-background sticky top-0 z-10 flex h-9 items-center justify-center border-b text-sm">
                  <span className="text-muted-foreground">{day.label}</span>
                  <span className="ml-1.5 font-medium tabular-nums">{ddmm(day.date)}</span>
                </div>

                <div
                  className={cn('relative', canBook && 'cursor-pointer')}
                  onClick={
                    canBook
                      ? (event) => {
                          /*
                           * Bấm vào chỗ trống trên lưới là cách đặt lịch nhanh
                           * nhất ở quầy — lễ tân đã nhìn thấy khoảng trống rồi,
                           * bắt họ mở panel và chọn lại đúng giờ đó là thừa một
                           * bước. Làm tròn xuống mốc gần nhất.
                           */
                          const box = event.currentTarget.getBoundingClientRect()
                          const raw = (event.clientY - box.top) / PX_PER_MINUTE + gridFrom
                          const snapped = Math.floor(raw / step) * step
                          setPanel({
                            date: day.iso,
                            minute: Math.max(0, Math.min(24 * 60 - step, snapped)),
                          })
                        }
                      : undefined
                  }
                  style={{ height: (gridTo - gridFrom) * PX_PER_MINUTE }}
                >
                  {ticks.slice(1, -1).map((m) => (
                    <div
                      key={m}
                      className={cn(
                        'border-border absolute inset-x-0 border-t',
                        m % 60 !== 0 && 'border-dashed opacity-40',
                      )}
                      style={{ top: (m - gridFrom) * PX_PER_MINUTE }}
                    />
                  ))}

                  {i === todayIndex && nowMinute >= gridFrom && nowMinute <= gridTo && (
                    <div
                      className="bg-danger absolute inset-x-0 z-10 h-px"
                      style={{ top: (nowMinute - gridFrom) * PX_PER_MINUTE }}
                    >
                      <span className="bg-danger absolute -top-1 -left-0.5 size-2 rounded-full" />
                    </div>
                  )}

                  {placed
                    .filter((p) => p.day === i)
                    .map(({ item, lane, lanes }) => {
                      const s = minuteOfDayVN(item.startsAt)
                      const e = minuteOfDayVN(item.endsAt)
                      const height = Math.max((e - s) * PX_PER_MINUTE, 18)
                      return (
                        <div
                          key={item.id}
                          title={`${hhmm(s)}–${hhmm(e)} · ${item.customerName} · ${item.serviceName}${
                            item.roomName ? ` · ${item.roomName}` : ''
                          }${item.performerName ? ` · ${item.performerName}` : ''} · ${
                            BOOKING_STATUS_LABEL[item.status] ?? item.status
                          }`}
                          onPointerDown={
                            canBook
                              ? (event) => {
                                  event.stopPropagation()
                                  dragRef.current = {
                                    id: item.id,
                                    startY: event.clientY,
                                    startMinute: s,
                                    moved: false,
                                  }
                                  event.currentTarget.setPointerCapture(event.pointerId)
                                }
                              : undefined
                          }
                          onPointerMove={(event) => {
                            const d = dragRef.current
                            if (!d || d.id !== item.id) return
                            const delta = (event.clientY - d.startY) / PX_PER_MINUTE
                            // Dưới 4px coi như bấm, không phải kéo — ngón tay
                            // không bao giờ đứng yên tuyệt đối.
                            if (!d.moved && Math.abs(event.clientY - d.startY) < 4) return
                            d.moved = true
                            setDrag({ id: item.id, offsetMinutes: Math.round(delta / step) * step })
                          }}
                          onPointerUp={(event) => {
                            const d = dragRef.current
                            dragRef.current = null
                            const offset = drag?.id === item.id ? drag.offsetMinutes : 0
                            setDrag(null)
                            if (!d) return
                            if (!d.moved || offset === 0) {
                              setDetail(item)
                              return
                            }
                            event.stopPropagation()
                            const next = new Date(
                              new Date(item.startsAt).getTime() + offset * 60_000,
                            )
                            setDragError('')
                            startTransition(async () => {
                              const result = await moveBookingItemAction(
                                item.id,
                                next.toISOString(),
                              )
                              if (!result.ok) setDragError(result.error ?? 'Không dời được lịch.')
                              router.refresh()
                            })
                          }}
                          onClick={(event) => event.stopPropagation()}
                          className={cn(
                            'absolute overflow-hidden rounded border px-1.5 py-0.5 text-left text-[0.7rem] leading-tight',
                            STATUS_STYLE[item.status] ?? STATUS_STYLE.scheduled,
                            canBook && 'cursor-grab hover:brightness-95 active:cursor-grabbing',
                            drag?.id === item.id && 'ring-primary z-20 shadow-lg ring-2',
                          )}
                          style={{
                            top:
                              (s - gridFrom + (drag?.id === item.id ? drag.offsetMinutes : 0)) *
                              PX_PER_MINUTE,
                            height,
                            left: `calc(${(lane / lanes) * 100}% + 2px)`,
                            width: `calc(${100 / lanes}% - 4px)`,
                          }}
                        >
                          <p className="truncate font-medium">{item.customerName}</p>
                          {height > 30 && (
                            <p className="text-muted-foreground truncate">
                              {hhmm(s)} · {item.serviceName}
                            </p>
                          )}
                        </div>
                      )
                    })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {shown.length === 0 && (
          <div className="text-muted-foreground pointer-events-none -mt-[40vh] flex flex-col items-center justify-center gap-2 text-center text-sm">
            <CalendarDays className="size-8 opacity-50" />
            <p>
              {items.length === 0
                ? 'Chưa có lịch hẹn nào trong khoảng này.'
                : 'Không có lịch nào khớp bộ lọc.'}
            </p>
          </div>
        )}
      </div>

      {dragError && (
        <p
          role="alert"
          className="text-danger bg-danger/10 shrink-0 px-3 py-2 text-sm"
          onClick={() => setDragError('')}
        >
          {dragError}
        </p>
      )}

      <div className="border-border text-muted-foreground shrink-0 border-t px-3 py-1.5 text-sm">
        Tổng số {shown.length} lịch hẹn
        {shown.length !== items.length && (
          <span className="text-muted-foreground"> (lọc từ {items.length})</span>
        )}
      </div>

      <BookingDetail
        item={detail}
        reasons={cancelReasons}
        canManage={canBook}
        onClose={() => setDetail(null)}
      />

      {panel && (
        <BookingPanel
          open
          onOpenChange={(next) => !next && setPanel(null)}
          options={options}
          todayISO={todayISO}
          initialDate={panel.date}
          initialMinute={panel.minute}
        />
      )}
    </div>
  )
}

/** 0 = thứ Hai … 6 = Chủ nhật, theo giờ Việt Nam. */
function weekdayIndex(date: Date): number {
  const vnDay = new Date(date.getTime() + TZ_OFFSET_MINUTES * 60_000).getUTCDay()
  return (vnDay + 6) % 7
}

function yearOf(date: Date): number {
  return new Date(date.getTime() + TZ_OFFSET_MINUTES * 60_000).getUTCFullYear()
}
