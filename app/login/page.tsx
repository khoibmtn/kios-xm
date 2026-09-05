import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { LoginForm } from './login-form'

export const metadata: Metadata = { title: 'Đăng nhập' }

export default async function LoginPage() {
  const session = await auth()
  if (session?.user) redirect('/admin')

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight">kios-xm</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Phần mềm quản lý spa
          </p>
        </div>

        <LoginForm />

        <p className="text-muted-foreground mt-6 text-center text-xs">
          Quên mật khẩu? Liên hệ quản lý để được cấp lại.
        </p>
      </div>
    </div>
  )
}
