'use client'

import { useActionState, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useFormStatus } from 'react-dom'
import { Field, Select, TextInput } from '@/components/form/fields'
import { Badge } from '@/components/data-table/filters'
import {
  changeRoleAction,
  createAccountAction,
  resetPasswordAction,
  setAccountActiveAction,
  type AccountActionState,
} from './actions'

interface Option {
  value: string
  label: string
}

interface Assignment {
  branchId: string
  branchName: string
  roleId: string
  roleName: string
}

interface AccountInfo {
  email: string
  isActive: boolean
  assignments: Assignment[]
}

interface Props {
  employeeId: string
  roles: Option[]
  branches: Option[]
  defaultEmail: string
  account: AccountInfo | null
}

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-5 py-2.5 text-sm font-medium disabled:opacity-60"
    >
      {pending ? pendingLabel : label}
    </button>
  )
}

/** Nhân viên chưa có tài khoản: form tạo mới. */
function CreateAccountForm({
  employeeId,
  roles,
  branches,
  defaultEmail,
}: {
  employeeId: string
  roles: Option[]
  branches: Option[]
  defaultEmail: string
}) {
  const router = useRouter()
  const [form, setForm] = useState({ email: defaultEmail, password: '', roleId: '', branchId: '' })

  const boundCreate = createAccountAction.bind(null, employeeId)
  const [state, formAction] = useActionState<AccountActionState, FormData>(async (prev, fd) => {
    const result = await boundCreate(prev, fd)
    if (result.ok) router.refresh()
    return result
  }, {})

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const err = (path: string) => state.fieldErrors?.[path]

  return (
    <form action={formAction} className="border-border bg-card space-y-4 rounded-lg border p-5">
      <div>
        <h2 className="font-semibold">Cấp tài khoản đăng nhập</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Nhân viên này chưa có tài khoản — chưa thể đăng nhập vào hệ thống.
        </p>
      </div>

      {state.error && (
        <p role="alert" className="text-danger bg-danger/10 rounded-md px-4 py-3 text-sm">
          {state.error}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Email đăng nhập" required error={err('email')}>
          <TextInput
            name="email"
            type="email"
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
            placeholder="ten@spa.vn"
            autoFocus
          />
        </Field>

        <Field label="Mật khẩu ban đầu" required error={err('password')} hint="Tối thiểu 8 ký tự">
          <TextInput
            name="password"
            type="password"
            value={form.password}
            onChange={(e) => set('password', e.target.value)}
          />
        </Field>

        <Field label="Vai trò" required error={err('roleId')}>
          <Select
            name="roleId"
            value={form.roleId}
            onChange={(e) => set('roleId', e.target.value)}
            options={roles}
            placeholder="— Chọn vai trò —"
          />
        </Field>

        <Field label="Chi nhánh" required error={err('branchId')}>
          <Select
            name="branchId"
            value={form.branchId}
            onChange={(e) => set('branchId', e.target.value)}
            options={branches}
            placeholder="— Chọn chi nhánh —"
          />
        </Field>
      </div>

      <SubmitButton label="Cấp tài khoản" pendingLabel="Đang tạo…" />
    </form>
  )
}

/** Đổi vai trò/chi nhánh — dùng chung ô chọn của components/form/fields để tránh lỗi reset của <select>. */
function ChangeRoleForm({
  employeeId,
  roles,
  branches,
  current,
}: {
  employeeId: string
  roles: Option[]
  branches: Option[]
  current: Assignment | null
}) {
  const router = useRouter()
  const [roleId, setRoleId] = useState(current?.roleId ?? '')
  const [branchId, setBranchId] = useState(current?.branchId ?? '')

  const boundChangeRole = changeRoleAction.bind(null, employeeId)
  const [state, formAction] = useActionState<AccountActionState, FormData>(async (prev, fd) => {
    const result = await boundChangeRole(prev, fd)
    if (result.ok) router.refresh()
    return result
  }, {})

  return (
    <form action={formAction} className="space-y-3">
      <h3 className="text-sm font-semibold">Vai trò &amp; chi nhánh</h3>

      {state.error && (
        <p role="alert" className="text-danger bg-danger/10 rounded-md px-3 py-2 text-sm">
          {state.error}
        </p>
      )}
      {state.ok && !state.error && (
        <p className="text-success bg-success/10 rounded-md px-3 py-2 text-sm">Đã lưu.</p>
      )}

      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Field label="Vai trò" error={state.fieldErrors?.roleId}>
          <Select
            name="roleId"
            value={roleId}
            onChange={(e) => setRoleId(e.target.value)}
            options={roles}
            placeholder="— Chọn vai trò —"
          />
        </Field>

        <Field label="Chi nhánh" error={state.fieldErrors?.branchId}>
          <Select
            name="branchId"
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            options={branches}
            placeholder="— Chọn chi nhánh —"
          />
        </Field>

        <SubmitButton label="Lưu vai trò" pendingLabel="Đang lưu…" />
      </div>
    </form>
  )
}

function ResetPasswordForm({ employeeId }: { employeeId: string }) {
  const [password, setPassword] = useState('')

  const boundReset = resetPasswordAction.bind(null, employeeId)
  const [state, formAction] = useActionState<AccountActionState, FormData>(async (prev, fd) => {
    const result = await boundReset(prev, fd)
    if (result.ok) setPassword('')
    return result
  }, {})

  return (
    <form action={formAction} className="space-y-3">
      <h3 className="text-sm font-semibold">Đặt lại mật khẩu</h3>

      {state.error && (
        <p role="alert" className="text-danger bg-danger/10 rounded-md px-3 py-2 text-sm">
          {state.error}
        </p>
      )}
      {state.ok && !state.error && (
        <p className="text-success bg-success/10 rounded-md px-3 py-2 text-sm">
          Đã đặt lại mật khẩu.
        </p>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <Field
          label="Mật khẩu mới"
          error={state.fieldErrors?.password}
          hint="Tối thiểu 8 ký tự"
          className="w-64"
        >
          <TextInput
            name="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>

        <SubmitButton label="Đặt lại mật khẩu" pendingLabel="Đang lưu…" />
      </div>
    </form>
  )
}

/** Khoá / mở khoá — không có ô nhập nên gọi action trực tiếp thay vì qua <form>. */
function ActiveToggle({ employeeId, isActive }: { employeeId: string; isActive: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')

  const toggle = () => {
    const next = !isActive
    const confirmMessage = next
      ? 'Mở khoá tài khoản này? Nhân viên sẽ đăng nhập lại được.'
      : 'Khoá tài khoản này? Nhân viên sẽ không đăng nhập được nữa.'
    if (!confirm(confirmMessage)) return

    setError('')
    startTransition(async () => {
      const result = await setAccountActiveAction(employeeId, next)
      if (!result.ok) {
        setError(result.error ?? 'Không đổi được trạng thái.')
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        className={
          isActive
            ? 'border-danger text-danger hover:bg-danger/10 rounded-md border px-4 py-2 text-sm disabled:opacity-60'
            : 'border-border hover:bg-muted rounded-md border px-4 py-2 text-sm disabled:opacity-60'
        }
      >
        {pending ? 'Đang xử lý…' : isActive ? 'Khoá tài khoản' : 'Mở khoá tài khoản'}
      </button>
      {error && <p className="text-danger text-xs">{error}</p>}
    </div>
  )
}

/** Nhân viên đã có tài khoản: xem trạng thái, đổi vai trò, đặt lại mật khẩu, khoá/mở khoá. */
function ManageAccountForm({
  employeeId,
  roles,
  branches,
  account,
}: {
  employeeId: string
  roles: Option[]
  branches: Option[]
  account: AccountInfo
}) {
  const current = account.assignments[0] ?? null

  return (
    <div className="border-border bg-card space-y-6 rounded-lg border p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">{account.email}</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            {account.assignments.length === 0
              ? 'Chưa gán vai trò tại chi nhánh nào.'
              : account.assignments.map((a) => `${a.roleName} · ${a.branchName}`).join(', ')}
          </p>
        </div>
        <Badge tone={account.isActive ? 'success' : 'danger'}>
          {account.isActive ? 'Đang hoạt động' : 'Đã khoá'}
        </Badge>
      </div>

      <hr className="border-border" />

      {account.assignments.length > 1 && (
        <p className="text-warning bg-warning/10 rounded-md px-3 py-2 text-xs">
          Nhân viên đang giữ nhiều vai trò. Lưu ở mục dưới sẽ thay toàn bộ bằng đúng một vai trò/chi
          nhánh được chọn.
        </p>
      )}
      <ChangeRoleForm employeeId={employeeId} roles={roles} branches={branches} current={current} />

      <hr className="border-border" />
      <ResetPasswordForm employeeId={employeeId} />

      <hr className="border-border" />
      <div>
        <h3 className="mb-2 text-sm font-semibold">Trạng thái tài khoản</h3>
        <ActiveToggle employeeId={employeeId} isActive={account.isActive} />
      </div>
    </div>
  )
}

export function AccountForm({ employeeId, roles, branches, defaultEmail, account }: Props) {
  if (!account) {
    return (
      <CreateAccountForm
        employeeId={employeeId}
        roles={roles}
        branches={branches}
        defaultEmail={defaultEmail}
      />
    )
  }

  return (
    <ManageAccountForm
      employeeId={employeeId}
      roles={roles}
      branches={branches}
      account={account}
    />
  )
}
