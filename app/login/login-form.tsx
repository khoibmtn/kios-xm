'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { loginAction, type LoginState } from './actions'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring w-full rounded-md px-4 py-2.5 text-sm font-medium transition focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-60"
    >
      {pending ? 'Đang đăng nhập…' : 'Đăng nhập'}
    </button>
  )
}

export function LoginForm() {
  const [state, formAction] = useActionState<LoginState, FormData>(
    loginAction,
    {},
  )

  return (
    <form
      action={formAction}
      className="border-border bg-card space-y-4 rounded-lg border p-6 shadow-sm"
    >
      <div className="space-y-1.5">
        <label htmlFor="email" className="block text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          autoFocus
          className="border-input focus-visible:ring-ring w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="password" className="block text-sm font-medium">
          Mật khẩu
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="border-input focus-visible:ring-ring w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
        />
      </div>

      {state.error && (
        <p
          role="alert"
          className="text-danger bg-danger/10 rounded-md px-3 py-2 text-sm"
        >
          {state.error}
        </p>
      )}

      <SubmitButton />
    </form>
  )
}
