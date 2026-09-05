'use client'

import { useActionState, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useFormStatus } from 'react-dom'
import { Check, Plus, X } from 'lucide-react'
import { Field, Select, TextArea, TextInput } from '@/components/form/fields'
import { Badge } from '@/components/data-table/filters'
import { saveEmployeeAction, createOrgUnitAction, type ActionState } from './actions'
import { GENDER_OPTIONS, type EmployeeFormData, type Option } from './form-data'

interface Props {
  initial: EmployeeFormData
  departments: Option[]
  positions: Option[]
  branches: Option[]
}

function SubmitButton({ isEdit }: { isEdit: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-5 py-2.5 text-sm font-medium disabled:opacity-60"
    >
      {pending ? 'Đang lưu…' : isEdit ? 'Lưu thay đổi' : 'Thêm nhân viên'}
    </button>
  )
}

/**
 * Ô chọn kèm nút tạo nhanh.
 *
 * Spa mới dùng phần mềm thì phòng ban và chức danh đều rỗng, nên nếu bắt phải
 * sang màn hình khác khai trước thì hồ sơ đang nhập dở sẽ mất. KiotViet để
 * "Tạo mới" ngay trong ô chọn vì lý do đó, và ở đây cũng vậy.
 *
 * Ô nhập tên nằm *trong* thẻ `<form>` của hồ sơ nhân viên — HTML không cho
 * lồng form — nên phải chặn phím Enter, nếu không Enter sẽ gửi luôn cả hồ sơ
 * còn dang dở thay vì tạo phòng ban.
 */
function SelectWithCreate({
  label,
  name,
  value,
  options,
  onChange,
  onCreated,
  kind,
  placeholder,
  error,
}: {
  label: string
  name: string
  value: string
  options: Option[]
  onChange: (value: string) => void
  onCreated: (option: Option) => void
  kind: 'department' | 'position'
  placeholder: string
  error?: string
}) {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const [message, setMessage] = useState('')
  const [pending, startTransition] = useTransition()

  const create = () => {
    const trimmed = draft.trim()
    if (!trimmed) return
    startTransition(async () => {
      const result = await createOrgUnitAction(kind, trimmed)
      if (result.error || !result.id || !result.name) {
        setMessage(result.error ?? 'Không tạo được')
        return
      }
      onCreated({ value: result.id, label: result.name })
      onChange(result.id)
      setDraft('')
      setMessage('')
      setAdding(false)
    })
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label className="block text-sm font-medium">{label}</label>
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="text-primary inline-flex items-center gap-1 text-xs hover:underline"
          >
            <Plus className="size-3.5" /> Tạo mới
          </button>
        )}
      </div>

      <Select
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        options={options}
        placeholder={placeholder}
      />

      {adding && (
        <div className="flex items-center gap-1.5">
          <TextInput
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                create()
              }
              if (e.key === 'Escape') setAdding(false)
            }}
            placeholder={`Tên ${label.toLowerCase()} mới`}
            autoFocus
            disabled={pending}
          />
          <button
            type="button"
            onClick={create}
            disabled={pending}
            aria-label="Lưu"
            className="text-success hover:bg-muted rounded-md p-2 disabled:opacity-50"
          >
            <Check className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setAdding(false)
              setMessage('')
            }}
            aria-label="Huỷ"
            className="text-muted-foreground hover:bg-muted rounded-md p-2"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {(error || message) && <p className="text-danger text-xs">{error ?? message}</p>}
    </div>
  )
}

export function EmployeeForm({ initial, departments, positions, branches }: Props) {
  const router = useRouter()
  const isEdit = !!initial.id
  const [form, setForm] = useState<EmployeeFormData>(initial)
  const [departmentOptions, setDepartmentOptions] = useState(departments)
  const [positionOptions, setPositionOptions] = useState(positions)

  const action = saveEmployeeAction.bind(null, initial.id ?? null)
  const [state, formAction] = useActionState<ActionState, FormData>(
    async (prev, fd) => {
      const result = await action(prev, fd)
      if (result.savedId) router.push('/admin/employees')
      return result
    },
    {},
  )

  const set = <K extends keyof EmployeeFormData>(key: K, value: EmployeeFormData[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const err = (path: string) => state.fieldErrors?.[path]

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="status" value={form.status} />

      {state.error && (
        <p role="alert" className="text-danger bg-danger/10 rounded-md px-4 py-3 text-sm">
          {state.error}
        </p>
      )}

      <section className="border-border bg-card space-y-4 rounded-lg border p-5">
        <h2 className="font-semibold">Thông tin cá nhân</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tên nhân viên" required error={err('fullName')} className="sm:col-span-2">
            <TextInput
              name="fullName"
              value={form.fullName}
              onChange={(e) => set('fullName', e.target.value)}
              placeholder="Nguyễn Thị An"
              autoFocus
            />
          </Field>

          <Field
            label="Mã nhân viên"
            error={err('code')}
            hint={isEdit ? undefined : 'Để trống thì hệ thống tự sinh'}
          >
            <TextInput
              name="code"
              value={form.code}
              onChange={(e) => set('code', e.target.value.toUpperCase())}
              placeholder="Tự sinh"
            />
          </Field>

          <Field label="Mã chấm công" error={err('clockCode')} hint="Mã quẹt thẻ hoặc vân tay">
            <TextInput
              name="clockCode"
              value={form.clockCode}
              onChange={(e) => set('clockCode', e.target.value)}
            />
          </Field>

          <Field label="Số điện thoại" error={err('phone')}>
            <TextInput
              name="phone"
              type="tel"
              inputMode="tel"
              value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
              placeholder="0901234567"
            />
          </Field>

          <Field label="Email" error={err('email')}>
            <TextInput
              name="email"
              type="email"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
            />
          </Field>

          <Field label="Giới tính" error={err('gender')}>
            <Select
              name="gender"
              value={form.gender}
              onChange={(e) => set('gender', e.target.value)}
              options={GENDER_OPTIONS}
              placeholder="— Chưa khai —"
            />
          </Field>

          <Field label="Ngày sinh" error={err('birthday')}>
            <TextInput
              name="birthday"
              type="date"
              value={form.birthday}
              onChange={(e) => set('birthday', e.target.value)}
            />
          </Field>

          <Field label="Số CMND/CCCD" error={err('idNumber')}>
            <TextInput
              name="idNumber"
              value={form.idNumber}
              onChange={(e) => set('idNumber', e.target.value)}
            />
          </Field>

          <Field label="Địa chỉ" error={err('address')} className="sm:col-span-2">
            <TextInput
              name="address"
              value={form.address}
              onChange={(e) => set('address', e.target.value)}
            />
          </Field>
        </div>
      </section>

      <section className="border-border bg-card space-y-4 rounded-lg border p-5">
        <h2 className="font-semibold">Công việc</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <SelectWithCreate
            label="Phòng ban"
            name="departmentId"
            kind="department"
            value={form.departmentId}
            options={departmentOptions}
            onChange={(v) => set('departmentId', v)}
            onCreated={(o) => setDepartmentOptions((prev) => [...prev, o])}
            placeholder="— Chưa phân phòng ban —"
            error={err('departmentId')}
          />

          <SelectWithCreate
            label="Chức danh"
            name="positionId"
            kind="position"
            value={form.positionId}
            options={positionOptions}
            onChange={(v) => set('positionId', v)}
            onCreated={(o) => setPositionOptions((prev) => [...prev, o])}
            placeholder="— Chưa có chức danh —"
            error={err('positionId')}
          />

          <Field label="Chi nhánh làm việc" error={err('workBranchId')}>
            <Select
              name="workBranchId"
              value={form.workBranchId}
              onChange={(e) => set('workBranchId', e.target.value)}
              options={branches}
              placeholder="— Chọn chi nhánh —"
            />
          </Field>

          <Field
            label="Chi nhánh trả lương"
            error={err('payBranchId')}
            hint="Để trống thì tính theo chi nhánh làm việc"
          >
            <Select
              name="payBranchId"
              value={form.payBranchId}
              onChange={(e) => set('payBranchId', e.target.value)}
              options={branches}
              placeholder="— Như chi nhánh làm việc —"
            />
          </Field>

          <Field label="Ngày vào làm" error={err('hiredAt')}>
            <TextInput
              name="hiredAt"
              type="date"
              value={form.hiredAt}
              onChange={(e) => set('hiredAt', e.target.value)}
            />
          </Field>

          {form.status === 'left' && (
            <Field label="Ngày nghỉ" required error={err('leftAt')}>
              <TextInput
                name="leftAt"
                type="date"
                value={form.leftAt}
                onChange={(e) => set('leftAt', e.target.value)}
              />
            </Field>
          )}
        </div>
      </section>

      <section className="border-border bg-card space-y-4 rounded-lg border p-5">
        <h2 className="font-semibold">Tài khoản ngân hàng</h2>
        <p className="text-muted-foreground -mt-2 text-sm">Dùng khi chi lương và tạm ứng.</p>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Số tài khoản" error={err('bankAccount')}>
            <TextInput
              name="bankAccount"
              value={form.bankAccount}
              onChange={(e) => set('bankAccount', e.target.value)}
              className="tabular"
            />
          </Field>

          <Field label="Ngân hàng" error={err('bankName')}>
            <TextInput
              name="bankName"
              value={form.bankName}
              onChange={(e) => set('bankName', e.target.value)}
              placeholder="Vietcombank"
            />
          </Field>
        </div>

        <Field label="Ghi chú" error={err('note')}>
          <TextArea
            name="note"
            value={form.note}
            onChange={(e) => set('note', e.target.value)}
            placeholder="Ghi chú nội bộ, không hiện cho khách"
          />
        </Field>
      </section>

      <section className="border-border bg-card space-y-3 rounded-lg border p-5">
        <h2 className="font-semibold">Trạng thái làm việc</h2>
        <p className="text-muted-foreground -mt-1 text-sm">
          Nhân viên đã nghỉ vẫn giữ nguyên lịch sử dịch vụ và hoa hồng — chỉ không
          còn xuất hiện khi xếp lịch hay chọn người thực hiện.
        </p>
        <div className="flex flex-wrap gap-2">
          {(['working', 'left'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                set('status', s)
                // Chuyển về "đang làm" thì ngày nghỉ không còn nghĩa gì
                if (s === 'working') set('leftAt', '')
              }}
              className={`rounded-md border px-4 py-2 text-sm transition ${
                form.status === s
                  ? 'border-primary bg-primary/10 text-primary font-medium'
                  : 'border-border hover:bg-muted'
              }`}
            >
              {s === 'working' ? 'Đang làm việc' : 'Đã nghỉ'}
            </button>
          ))}
        </div>
      </section>

      <div className="flex items-center gap-3">
        <SubmitButton isEdit={isEdit} />
        <button
          type="button"
          onClick={() => router.back()}
          className="border-border hover:bg-muted rounded-md border px-5 py-2.5 text-sm"
        >
          Huỷ
        </button>
        {form.status === 'left' && <Badge>Đã nghỉ</Badge>}
      </div>
    </form>
  )
}
