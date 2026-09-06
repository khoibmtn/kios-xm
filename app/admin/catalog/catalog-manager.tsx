'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Field, Select, TextInput, Toggle } from '@/components/form/fields'
import { Badge } from '@/components/data-table/filters'
import { cn } from '@/lib/utils'
import type { CatalogRow, CategoryRow } from '@/lib/catalog/org-units'
import {
  deleteCatalogItemAction,
  saveCatalogItemAction,
  toggleCatalogItemAction,
  type CatalogKind,
} from './actions'

const TAB_LABEL: Record<CatalogKind, string> = {
  category: 'Nhóm hàng',
  brand: 'Thương hiệu',
  unit: 'Đơn vị tính',
}

const TAB_HINT: Record<CatalogKind, string> = {
  category: 'Xếp hàng hoá theo nhóm nhiều cấp, dùng để lọc và gộp báo cáo.',
  brand: 'Hãng mỹ phẩm — chỉ áp dụng cho sản phẩm bán lẻ.',
  unit: 'Chai, hộp, buổi, lần… hiển thị kèm số lượng trên hoá đơn.',
}

interface EditState {
  kind: CatalogKind
  id: string | null
  name: string
  parentId: string
}

export function CatalogManager({
  categories,
  brands,
  units,
  canManage,
}: {
  categories: CategoryRow[]
  brands: CatalogRow[]
  units: CatalogRow[]
  canManage: boolean
}) {
  const router = useRouter()
  const [tab, setTab] = useState<CatalogKind>('category')
  const [edit, setEdit] = useState<EditState | null>(null)
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  const rows: (CatalogRow | CategoryRow)[] =
    tab === 'category' ? categories : tab === 'brand' ? brands : units

  const openNew = () => {
    setError('')
    setEdit({ kind: tab, id: null, name: '', parentId: '' })
  }

  const openEdit = (row: CatalogRow | CategoryRow) => {
    setError('')
    setEdit({
      kind: tab,
      id: row.id,
      name: row.name,
      parentId: 'parentId' in row ? (row.parentId ?? '') : '',
    })
  }

  const save = () => {
    if (!edit) return
    startTransition(async () => {
      const result = await saveCatalogItemAction(edit.kind, edit.id, edit.name, edit.parentId)
      if (!result.ok) {
        setError(result.error ?? 'Không lưu được')
        return
      }
      setEdit(null)
      router.refresh()
    })
  }

  const remove = (row: CatalogRow) => {
    const warning =
      row.usage > 0
        ? `Xoá "${row.name}"? ${row.usage} hàng hoá đang dùng mục này sẽ bị bỏ trống ô tương ứng.`
        : `Xoá "${row.name}"?`
    if (!confirm(warning)) return

    startTransition(async () => {
      const result = await deleteCatalogItemAction(tab, row.id)
      if (!result.ok) {
        setError(result.error ?? 'Không xoá được')
        return
      }
      router.refresh()
    })
  }

  const toggle = (row: CatalogRow, isActive: boolean) => {
    startTransition(async () => {
      const result = await toggleCatalogItemAction(tab, row.id, isActive)
      if (!result.ok) setError(result.error ?? 'Không đổi được trạng thái')
      router.refresh()
    })
  }

  /** Nhóm cha có thể chọn: bỏ chính nó và cả nhánh dưới, tránh cây tự cắn đuôi. */
  const parentOptions = categories
    .filter((c) => !edit?.id || (c.id !== edit.id && !c.path.includes(`/${edit.id}/`)))
    .map((c) => ({ value: c.id, label: `${'— '.repeat(c.depth)}${c.name}` }))

  return (
    <div className="space-y-4">
      <div className="border-border flex flex-wrap gap-1 border-b">
        {(Object.keys(TAB_LABEL) as CatalogKind[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              setTab(k)
              setError('')
            }}
            className={cn(
              '-mb-px border-b-2 px-4 py-2.5 text-sm transition',
              tab === k
                ? 'border-primary text-primary font-medium'
                : 'text-muted-foreground hover:text-foreground border-transparent',
            )}
          >
            {TAB_LABEL[k]}
            <span className="text-muted-foreground ml-1.5 text-xs">
              {k === 'category' ? categories.length : k === 'brand' ? brands.length : units.length}
            </span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">{TAB_HINT[tab]}</p>
        {canManage && (
          <Button size="sm" onClick={openNew}>
            <Plus className="size-4" /> Thêm {TAB_LABEL[tab].toLowerCase()}
          </Button>
        )}
      </div>

      {error && (
        <p role="alert" className="text-danger bg-danger/10 rounded-md px-4 py-3 text-sm">
          {error}
        </p>
      )}

      <div className="border-border bg-card overflow-hidden rounded-lg border">
        {rows.length === 0 ? (
          <p className="text-muted-foreground px-4 py-10 text-center text-sm">
            Chưa có {TAB_LABEL[tab].toLowerCase()} nào.
          </p>
        ) : (
          <ul className="divide-border divide-y">
            {rows.map((row) => (
              <li key={row.id} className="flex items-center gap-3 px-4 py-3">
                <span
                  className="min-w-0 flex-1 truncate text-sm"
                  style={
                    'depth' in row ? { paddingLeft: `${(row as CategoryRow).depth * 1.25}rem` } : undefined
                  }
                >
                  <span className={cn(!row.isActive && 'text-muted-foreground line-through')}>
                    {row.name}
                  </span>
                  {!row.isActive && (
                    <span className="ml-2">
                      <Badge>Ngừng dùng</Badge>
                    </span>
                  )}
                </span>

                <span className="text-muted-foreground shrink-0 text-xs">
                  {row.usage > 0 ? `${row.usage} hàng hoá` : '—'}
                </span>

                {canManage && (
                  <span className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Sửa"
                      onClick={() => openEdit(row)}
                      disabled={pending}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Xoá"
                      onClick={() => remove(row)}
                      disabled={pending}
                      className="text-muted-foreground hover:text-danger"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog open={edit !== null} onOpenChange={(open) => !open && setEdit(null)}>
        {edit && (
          <DialogContent
            title={`${edit.id ? 'Sửa' : 'Thêm'} ${TAB_LABEL[edit.kind].toLowerCase()}`}
            footer={
              <>
                <Button variant="outline" size="sm" onClick={() => setEdit(null)}>
                  Huỷ
                </Button>
                <Button size="sm" onClick={save} disabled={pending}>
                  {pending ? 'Đang lưu…' : 'Lưu'}
                </Button>
              </>
            }
          >
            <div className="space-y-4">
              <Field label="Tên" required>
                <TextInput
                  value={edit.name}
                  onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      save()
                    }
                  }}
                  autoFocus
                />
              </Field>

              {edit.kind === 'category' && (
                <Field label="Thuộc nhóm" hint="Để trống nếu đây là nhóm cấp cao nhất">
                  <Select
                    value={edit.parentId}
                    onChange={(e) => setEdit({ ...edit, parentId: e.target.value })}
                    options={parentOptions}
                    placeholder="— Nhóm cấp cao nhất —"
                  />
                </Field>
              )}

              {edit.id && (
                <Toggle
                  checked={rows.find((r) => r.id === edit.id)?.isActive ?? true}
                  onChange={(v) => {
                    const row = rows.find((r) => r.id === edit.id)
                    if (row) toggle(row, v)
                  }}
                  label="Đang dùng"
                  hint="Bỏ chọn để ẩn khỏi các ô chọn mà không xoá dữ liệu cũ"
                />
              )}

              {error && <p className="text-danger text-sm">{error}</p>}
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  )
}
