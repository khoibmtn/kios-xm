'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Field, Select, TextInput, Toggle } from '@/components/form/fields'
import { FEATURES, type FeatureKey } from '@/lib/settings/features'
import { saveSettingsAction, toggleFeatureAction } from './actions'

export interface SettingsData {
  bookingSlotMinutes: number
  bookingBufferMinutes: number
  limitBookingToShift: boolean
  packageRevenueAllocationMode: 'proportional_retail' | 'equal_per_session' | 'custom'
  costingMethod: 'average' | 'fixed'
  bookClosedUntil: string
}

export function SettingsForm({
  initial,
  features,
  canManage,
}: {
  initial: SettingsData
  features: Record<string, boolean>
  canManage: boolean
}) {
  const router = useRouter()
  const [form, setForm] = useState(initial)
  const [message, setMessage] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [pending, startTransition] = useTransition()

  const set = <K extends keyof SettingsData>(key: K, value: SettingsData[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const save = () => {
    startTransition(async () => {
      const result = await saveSettingsAction({ ...form })
      setFieldErrors(result.fieldErrors ?? {})
      setMessage(result.ok ? 'Đã lưu thiết lập.' : (result.error ?? 'Không lưu được'))
      if (result.ok) router.refresh()
    })
  }

  const toggleFeature = (key: FeatureKey, enabled: boolean) => {
    startTransition(async () => {
      const result = await toggleFeatureAction(key, enabled)
      if (!result.ok) setMessage(result.error ?? 'Không đổi được trạng thái')
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      {message && (
        <p
          role="status"
          className="bg-muted text-foreground rounded-md px-4 py-3 text-sm"
        >
          {message}
        </p>
      )}

      <section className="border-border bg-card space-y-4 rounded-lg border p-5">
        <div>
          <h2 className="font-semibold">Lịch hẹn</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Quyết định hình dạng lưới xếp lịch và mức chặt khi kiểm tra trùng giờ.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Bước thời gian"
            error={fieldErrors.bookingSlotMinutes}
            hint="Độ cao một ô trên lưới lịch hẹn"
          >
            <Select
              value={String(form.bookingSlotMinutes)}
              onChange={(e) => set('bookingSlotMinutes', Number(e.target.value))}
              options={[
                { value: '15', label: '15 phút' },
                { value: '30', label: '30 phút' },
                { value: '60', label: '60 phút' },
              ]}
            />
          </Field>

          <Field
            label="Thời gian đệm giữa hai buổi (phút)"
            error={fieldErrors.bookingBufferMinutes}
            hint="Thời gian dọn phòng, thay ga — không xếp khách vào khoảng này"
          >
            <TextInput
              type="number"
              min={0}
              max={60}
              value={String(form.bookingBufferMinutes)}
              onChange={(e) => set('bookingBufferMinutes', Number(e.target.value))}
              className="w-28"
            />
          </Field>
        </div>

        <Toggle
          checked={form.limitBookingToShift}
          onChange={(v) => set('limitBookingToShift', v)}
          label="Chỉ xếp lịch trong ca làm việc của kỹ thuật viên"
          hint="Bật thì không đặt được lịch ngoài ca đã phân, kể cả khi phòng còn trống"
        />
      </section>

      <section className="border-border bg-card space-y-4 rounded-lg border p-5">
        <div>
          <h2 className="font-semibold">Doanh thu và giá vốn</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Hai lựa chọn dưới đây đổi con số trên báo cáo, nên mọi thay đổi đều được
            ghi vào nhật ký.
          </p>
        </div>

        <Field
          label="Cách phân bổ giá trị gói liệu trình"
          error={fieldErrors.packageRevenueAllocationMode}
          hint="Khi khách dùng một buổi từ gói, buổi đó được tính đáng giá bao nhiêu"
        >
          <Select
            value={form.packageRevenueAllocationMode}
            onChange={(e) =>
              set(
                'packageRevenueAllocationMode',
                e.target.value as SettingsData['packageRevenueAllocationMode'],
              )
            }
            options={[
              { value: 'proportional_retail', label: 'Theo tỷ trọng giá bán lẻ (khuyến nghị)' },
              { value: 'equal_per_session', label: 'Chia đều cho mọi buổi' },
              { value: 'custom', label: 'Tự nhập cho từng dịch vụ' },
            ]}
          />
        </Field>

        <Field
          label="Phương pháp tính giá vốn"
          error={fieldErrors.costingMethod}
          hint="Bình quân gia quyền hợp với mỹ phẩm nhập nhiều đợt giá khác nhau"
        >
          <Select
            value={form.costingMethod}
            onChange={(e) => set('costingMethod', e.target.value as SettingsData['costingMethod'])}
            options={[
              { value: 'average', label: 'Bình quân gia quyền' },
              { value: 'fixed', label: 'Giá vốn cố định theo hàng hoá' },
            ]}
          />
        </Field>

        <Field
          label="Khoá sổ tới ngày"
          error={fieldErrors.bookClosedUntil}
          hint="Không sửa được chứng từ có ngày trước mốc này. Để trống nghĩa là chưa khoá."
        >
          <TextInput
            type="date"
            value={form.bookClosedUntil}
            onChange={(e) => set('bookClosedUntil', e.target.value)}
            className="w-48"
          />
        </Field>
      </section>

      {canManage && (
        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={pending}>
            {pending ? 'Đang lưu…' : 'Lưu thiết lập'}
          </Button>
        </div>
      )}

      <section className="border-border bg-card space-y-3 rounded-lg border p-5">
        <div>
          <h2 className="font-semibold">Tính năng tuỳ chọn</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Bật những phần spa thật sự dùng. Tắt bớt thì menu và màn hình gọn hơn cho
            nhân viên. Mỗi tính năng ghi rõ mốc nào bắt đầu có tác dụng.
          </p>
        </div>

        <div className="space-y-3">
          {(Object.keys(FEATURES) as FeatureKey[]).map((key) => (
            <div key={key} className="flex items-start justify-between gap-4">
              <Toggle
                checked={features[key] ?? false}
                onChange={(v) => toggleFeature(key, v)}
                label={FEATURES[key].label}
                hint={FEATURES[key].hint}
              />
              <span className="bg-muted text-muted-foreground shrink-0 rounded px-2 py-0.5 text-xs">
                từ {FEATURES[key].appliesFrom}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
