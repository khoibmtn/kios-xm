'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Sheet, SheetContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatPhone } from '@/lib/format'
import { BOOKING_STATUS_LABEL } from '@/lib/schema/bookings'
import { cancelBookingAction, setBookingStatusAction } from './actions'
import type { CalendarItem } from './calendar-grid'

export interface CancelReason {
  id: string
  name: string
}

/**
 * Bốn trạng thái lễ tân bấm trong ngày, theo đúng thứ tự khách đi qua. Bỏ
 * `confirmed` ra khỏi đây: nó dành cho luồng xác nhận qua tin nhắn (M8), bày
 * thêm một nút chưa dùng tới chỉ làm thanh này rối.
 */
const FLOW: { value: 'scheduled' | 'arrived' | 'in_progress' | 'done'; label: string }[] = [
  { value: 'scheduled', label: 'Chưa tới' },
  { value: 'arrived', label: 'Đã tới' },
  { value: 'in_progress', label: 'Đang làm' },
  { value: 'done', label: 'Hoàn thành' },
]

const hhmm = (iso: string) =>
  new Date(new Date(iso).getTime() + 7 * 60 * 60_000).toISOString().slice(11, 16)

export function BookingDetail({
  item,
  reasons,
  canManage,
  onClose,
}: {
  item: CalendarItem | null
  reasons: CancelReason[]
  canManage: boolean
  onClose: () => void
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [cancelling, setCancelling] = useState(false)
  const [reasonId, setReasonId] = useState('')
  const [reasonNote, setReasonNote] = useState('')

  if (!item) return null

  const close = () => {
    setError('')
    setCancelling(false)
    setReasonId('')
    setReasonNote('')
    onClose()
  }

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      setError('')
      const result = await fn()
      if (!result.ok) {
        setError(result.error ?? 'Không thực hiện được.')
        return
      }
      close()
      router.refresh()
    })

  return (
    <Sheet open onOpenChange={(next) => !next && close()}>
      <SheetContent
        title={item.customerName}
        description={`${hhmm(item.startsAt)}–${hhmm(item.endsAt)} · ${item.bookingCode}`}
        className="max-w-md"
        footer={
          canManage && !cancelling ? (
            <Button variant="danger" className="w-full" onClick={() => setCancelling(true)}>
              Huỷ lịch hẹn
            </Button>
          ) : undefined
        }
      >
        <div className="space-y-4">
          {error && (
            <p role="alert" className="text-danger bg-danger/10 rounded-md px-4 py-3 text-sm">
              {error}
            </p>
          )}

          <dl className="space-y-2 text-sm">
            <Row label="Dịch vụ" value={item.serviceName} />
            {item.customerPhone && (
              <Row label="Điện thoại" value={formatPhone(item.customerPhone)} />
            )}
            <Row label="Phòng" value={item.roomName ?? 'Chưa gán'} />
            <Row label="Kỹ thuật viên" value={item.performerName ?? 'Chưa gán'} />
            <Row label="Trạng thái" value={BOOKING_STATUS_LABEL[item.status] ?? item.status} />
          </dl>

          {canManage && !cancelling && (
            <div>
              <p className="mb-1.5 text-sm font-medium">Đổi trạng thái</p>
              <div className="grid grid-cols-2 gap-1.5">
                {FLOW.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    disabled={pending || item.status === s.value}
                    onClick={() => run(() => setBookingStatusAction(item.bookingId, s.value))}
                    className={cn(
                      'rounded-md border py-2 text-sm',
                      item.status === s.value
                        ? 'border-primary bg-primary/10 text-primary font-medium'
                        : 'border-border hover:bg-muted',
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                disabled={pending || item.status === 'no_show'}
                onClick={() => run(() => setBookingStatusAction(item.bookingId, 'no_show'))}
                className="border-border hover:bg-muted mt-1.5 w-full rounded-md border py-2 text-sm"
              >
                Khách không tới
              </button>
            </div>
          )}

          {cancelling && (
            <div className="border-danger/40 bg-danger/5 space-y-3 rounded-md border p-4">
              <p className="text-sm font-medium">Huỷ lịch hẹn này?</p>
              {/*
                Bắt nêu lý do vì đây cũng là ràng buộc ở tầng cơ sở dữ liệu
                (`bookings_cancel_needs_reason`) — và vì ba tháng sau, "vì sao
                mất khách" là câu hỏi chỉ trả lời được nếu hôm nay có ghi.
              */}
              <select
                value={reasonId}
                onChange={(e) => setReasonId(e.target.value)}
                className="border-border w-full rounded-md border px-3 py-2 text-sm"
              >
                <option value="">— Chọn lý do —</option>
                {reasons.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
              <textarea
                value={reasonNote}
                onChange={(e) => setReasonNote(e.target.value)}
                rows={2}
                placeholder="Ghi thêm nếu cần…"
                className="border-border w-full rounded-md border px-3 py-2 text-sm"
              />
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setCancelling(false)} disabled={pending}>
                  Thôi
                </Button>
                <Button
                  variant="danger"
                  className="flex-1"
                  disabled={pending || (!reasonId && !reasonNote.trim())}
                  onClick={() =>
                    run(() => cancelBookingAction(item.bookingId, reasonId || null, reasonNote))
                  }
                >
                  {pending ? 'Đang huỷ…' : 'Xác nhận huỷ'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <dt className="text-muted-foreground w-28 shrink-0">{label}</dt>
      <dd className="min-w-0 flex-1">{value}</dd>
    </div>
  )
}
