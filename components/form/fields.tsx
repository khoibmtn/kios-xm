'use client'

import { useEffect, useRef } from 'react'
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

/** Các ô nhập dùng chung cho mọi form trong hệ thống. */

const controlClass =
  'w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60'

export function Field({
  label,
  error,
  hint,
  required,
  children,
  className = '',
}: {
  label: string
  error?: string
  hint?: ReactNode
  required?: boolean
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <label className="block text-sm font-medium">
        {label}
        {required && <span className="text-danger ml-0.5">*</span>}
      </label>
      {children}
      {error ? (
        <p className="text-danger text-xs">{error}</p>
      ) : hint ? (
        <p className="text-muted-foreground text-xs">{hint}</p>
      ) : null}
    </div>
  )
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(controlClass, props.className)} />
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(controlClass, props.className)} rows={props.rows ?? 3} />
}

export function Select({
  options,
  placeholder,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  options: { value: string; label: string }[]
  placeholder?: string
}) {
  const ref = useRef<HTMLSelectElement>(null)

  /*
   * React 19 tự reset `<form action={...}>` sau khi server action chạy xong.
   * Với `<input>` thì React ghi lại giá trị đang giữ trong state, nhưng
   * `<select>` thì không: ô nhảy về mục đầu tiên trong khi state vẫn đúng.
   * Hậu quả thấy được: submit hỏng một ô, form báo lỗi, và mọi ô chọn khác
   * trông như trống — người dùng chọn lại từ đầu dù dữ liệu chưa hề mất.
   * Nên tự áp lại giá trị sau mỗi lần render.
   */
  useEffect(() => {
    const el = ref.current
    if (el && props.value !== undefined && el.value !== String(props.value)) {
      el.value = String(props.value)
    }
  })

  return (
    <select ref={ref} {...props} className={cn(controlClass, props.className)}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

/**
 * Ô nhập tiền.
 *
 * Người Việt gõ tiền có dấu chấm ngăn nghìn, nên ô này hiện dấu chấm nhưng
 * gửi đi số thuần. Dùng `inputMode="numeric"` để điện thoại bật bàn phím số.
 */
export function MoneyInput({
  value,
  onChange,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: string
  onChange: (raw: string) => void
}) {
  const display = value === '' ? '' : new Intl.NumberFormat('vi-VN').format(Number(value) || 0)

  return (
    <div className="relative">
      <input
        {...props}
        type="text"
        inputMode="numeric"
        value={display}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
        className={cn(controlClass, 'tabular pr-9 text-right', props.className)}
      />
      <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm">
        đ
      </span>
    </div>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  hint?: string
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-primary mt-0.5 size-4"
      />
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {hint && <span className="text-muted-foreground block text-xs">{hint}</span>}
      </span>
    </label>
  )
}
