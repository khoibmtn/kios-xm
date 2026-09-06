'use client'

import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Hộp thoại và ngăn kéo, dựng trên Radix Dialog.
 *
 * Dùng thư viện thay vì tự viết vì phần khó không nằm ở lớp phủ mà ở hành vi:
 * giam tiêu điểm bàn phím trong hộp thoại, trả tiêu điểm về đúng nút đã mở nó,
 * Esc để đóng, khoá cuộn nền, và các thuộc tính ARIA để trình đọc màn hình
 * hiểu. Tự làm lại những thứ đó gần như chắc chắn sẽ sai ở đâu đó.
 *
 * `Sheet` chỉ là hộp thoại trượt từ mép — dùng cho bộ lọc và biểu mẫu trên
 * điện thoại, nơi hộp thoại giữa màn hình quá chật.
 */

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close

function Overlay({ className, ...props }: ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      {...props}
      className={cn(
        'fixed inset-0 z-50 bg-black/40',
        'data-[state=open]:animate-in data-[state=open]:fade-in-0',
        'data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
        className,
      )}
    />
  )
}

export function DialogContent({
  title,
  description,
  children,
  footer,
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content> & {
  title: string
  description?: string
  footer?: ReactNode
}) {
  return (
    <DialogPrimitive.Portal>
      <Overlay />
      <DialogPrimitive.Content
        {...props}
        className={cn(
          'bg-card fixed z-50 flex flex-col shadow-lg',
          // Điện thoại: dán đáy màn hình, trong tầm ngón cái. Máy tính: giữa màn hình.
          'inset-x-0 bottom-0 max-h-[90dvh] rounded-t-xl',
          'sm:inset-x-auto sm:bottom-auto sm:top-1/2 sm:left-1/2 sm:w-full sm:max-w-lg',
          'sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg',
          className,
        )}
      >
        <div className="border-border flex items-start justify-between gap-4 border-b px-5 py-4">
          <div className="min-w-0">
            <DialogPrimitive.Title className="truncate font-semibold">{title}</DialogPrimitive.Title>
            {description && (
              <DialogPrimitive.Description className="text-muted-foreground mt-0.5 text-sm">
                {description}
              </DialogPrimitive.Description>
            )}
          </div>
          <DialogPrimitive.Close
            aria-label="Đóng"
            className="text-muted-foreground hover:bg-muted -mr-1.5 -mt-1 rounded-md p-2"
          >
            <X className="size-4" />
          </DialogPrimitive.Close>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {footer && (
          <div className="border-border flex items-center justify-end gap-2 border-t px-5 py-3">
            {footer}
          </div>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

export const Sheet = DialogPrimitive.Root
export const SheetTrigger = DialogPrimitive.Trigger
export const SheetClose = DialogPrimitive.Close

export function SheetContent({
  title,
  description,
  side = 'right',
  children,
  footer,
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content> & {
  title: string
  description?: string
  side?: 'left' | 'right'
  footer?: ReactNode
}) {
  return (
    <DialogPrimitive.Portal>
      <Overlay />
      <DialogPrimitive.Content
        {...props}
        className={cn(
          'bg-card fixed inset-y-0 z-50 flex w-full max-w-sm flex-col shadow-lg',
          side === 'right' ? 'right-0' : 'left-0',
          className,
        )}
      >
        <div className="border-border flex items-start justify-between gap-4 border-b px-5 py-4">
          <div className="min-w-0">
            <DialogPrimitive.Title className="truncate font-semibold">{title}</DialogPrimitive.Title>
            {description && (
              <DialogPrimitive.Description className="text-muted-foreground mt-0.5 text-sm">
                {description}
              </DialogPrimitive.Description>
            )}
          </div>
          <DialogPrimitive.Close
            aria-label="Đóng"
            className="text-muted-foreground hover:bg-muted -mr-1.5 -mt-1 rounded-md p-2"
          >
            <X className="size-4" />
          </DialogPrimitive.Close>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {footer && (
          <div className="border-border flex items-center justify-end gap-2 border-t px-5 py-3">
            {footer}
          </div>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}
