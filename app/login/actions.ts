'use server'

import { AuthError } from 'next-auth'
import { signIn } from '@/auth'

export interface LoginState {
  error?: string
}

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')

  if (!email || !password) {
    return { error: 'Vui lòng nhập đủ email và mật khẩu.' }
  }

  try {
    await signIn('credentials', {
      email,
      password,
      redirectTo: '/admin',
    })
    return {}
  } catch (error) {
    if (error instanceof AuthError) {
      // Không phân biệt "sai email" và "sai mật khẩu" — tránh để lộ
      // email nào đang tồn tại trong hệ thống.
      return { error: 'Email hoặc mật khẩu không đúng.' }
    }
    throw error // redirect của Next.js cũng ném lỗi, phải để nó đi tiếp
  }
}
