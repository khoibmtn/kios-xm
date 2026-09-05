'use client'

import type { ReactNode } from 'react'

/** Các điều khiển lọc dùng lại cho mọi màn hình danh sách. */

export function FilterGroup({
  label,
  children,
  action,
}: {
  label: string
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          {label}
        </h3>
        {action}
      </div>
      {children}
    </div>
  )
}

export function RadioFilter<T extends string>({
  value,
  onChange,
  options,
  name,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
  name: string
}) {
  return (
    <div className="space-y-1">
      {options.map((o) => (
        <label
          key={o.value}
          className="hover:bg-muted flex cursor-pointer items-center gap-2 rounded px-1.5 py-1.5 text-sm"
        >
          <input
            type="radio"
            name={name}
            checked={value === o.value}
            onChange={() => onChange(o.value)}
            className="accent-primary"
          />
          {o.label}
        </label>
      ))}
    </div>
  )
}

export function CheckboxFilter<T extends string>({
  values,
  onChange,
  options,
}: {
  values: T[]
  onChange: (v: T[]) => void
  options: { value: T; label: string; hint?: string }[]
}) {
  const toggle = (v: T) =>
    onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v])

  return (
    <div className="space-y-1">
      {options.map((o) => (
        <label
          key={o.value}
          className="hover:bg-muted flex cursor-pointer items-center gap-2 rounded px-1.5 py-1.5 text-sm"
        >
          <input
            type="checkbox"
            checked={values.includes(o.value)}
            onChange={() => toggle(o.value)}
            className="accent-primary"
          />
          <span className="min-w-0 flex-1 truncate">{o.label}</span>
          {o.hint && <span className="text-muted-foreground text-xs">{o.hint}</span>}
        </label>
      ))}
    </div>
  )
}

export function SelectFilter({
  value,
  onChange,
  options,
  placeholder = 'Tất cả',
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  placeholder?: string
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="border-border focus-visible:ring-ring w-full rounded-md border bg-transparent px-2.5 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

/** Nhãn màu phân biệt loại hàng hoá, trạng thái… */
export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode
  tone?: 'neutral' | 'product' | 'service' | 'package' | 'card' | 'success' | 'warning' | 'danger'
}) {
  const tones: Record<string, string> = {
    neutral: 'bg-muted text-muted-foreground',
    product: 'bg-kind-product/10 text-kind-product',
    service: 'bg-kind-service/10 text-kind-service',
    package: 'bg-kind-package/10 text-kind-package',
    card: 'bg-kind-card/10 text-kind-card',
    success: 'bg-success/10 text-success',
    warning: 'bg-warning/10 text-warning',
    danger: 'bg-danger/10 text-danger',
  }

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${tones[tone]}`}
    >
      {children}
    </span>
  )
}
