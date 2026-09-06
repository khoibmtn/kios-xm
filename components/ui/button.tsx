import { cva, type VariantProps } from 'class-variance-authority'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

/**
 * Nút dùng chung.
 *
 * Trước đây mỗi màn hình tự viết lại chuỗi class cho nút — bốn chỗ, bốn cách
 * viết hơi khác nhau. Gom về đây để "nút chính" ở màn hàng hoá và màn nhân
 * viên là cùng một thứ, và để đổi bo góc hay chiều cao chỉ phải sửa một nơi.
 *
 * `min-h-11` là cố ý: lễ tân thao tác bằng ngón tay trên máy tính bảng, và
 * 44px là ngưỡng vùng bấm tối thiểu — cùng lý do với luật cảm ứng trong
 * `globals.css`.
 */
export const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md text-sm font-medium whitespace-nowrap transition ' +
    'focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none ' +
    'disabled:pointer-events-none disabled:opacity-60 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
        outline: 'border-border hover:bg-muted border bg-transparent',
        ghost: 'hover:bg-muted bg-transparent',
        danger: 'bg-danger text-danger-foreground hover:bg-danger/90',
        // Nút trên nền màu chủ đạo (thanh trên cùng)
        onPrimary: 'bg-white/15 text-primary-foreground hover:bg-white/25',
      },
      size: {
        sm: 'px-3 py-1.5',
        md: 'min-h-11 px-4 py-2.5 sm:min-h-0',
        lg: 'min-h-11 px-5 py-2.5 text-base',
        icon: 'size-9 p-0',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
)

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button {...props} className={cn(buttonVariants({ variant, size }), className)} />
}
