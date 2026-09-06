'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Field, Select, TextArea, TextInput, Toggle } from '@/components/form/fields'
import { Badge } from '@/components/data-table/filters'
import {
  deleteRoomAction,
  deleteRoomGroupAction,
  saveRoomAction,
  saveRoomGroupAction,
} from './actions'

export interface RoomRow {
  id: string
  name: string
  note: string | null
  groupId: string | null
  sortOrder: number
  isActive: boolean
}

export interface RoomGroupRow {
  id: string
  name: string
}

interface RoomDraft {
  id: string | null
  name: string
  note: string
  groupId: string
  sortOrder: string
  isActive: boolean
}

const EMPTY_ROOM: RoomDraft = {
  id: null,
  name: '',
  note: '',
  groupId: '',
  sortOrder: '0',
  isActive: true,
}

export function RoomManager({
  rooms,
  groups,
  branchName,
  canManage,
}: {
  rooms: RoomRow[]
  groups: RoomGroupRow[]
  branchName: string
  canManage: boolean
}) {
  const router = useRouter()
  const [draft, setDraft] = useState<RoomDraft | null>(null)
  const [groupDraft, setGroupDraft] = useState<{ id: string | null; name: string } | null>(null)
  const [message, setMessage] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [pending, startTransition] = useTransition()

  /*
   * Gom phòng theo nhóm, nhóm chưa phân xếp cuối. Sắp theo `sortOrder` rồi mới
   * tới tên: chủ spa muốn "Phòng 1, Phòng 2, Phòng 10" chứ không phải thứ tự
   * bảng chữ cái, mà đánh số trong tên thì không giải quyết được.
   */
  const sections = [
    ...groups.map((g) => ({ group: g, items: rooms.filter((r) => r.groupId === g.id) })),
    { group: null, items: rooms.filter((r) => !r.groupId) },
  ].filter((s) => s.group !== null || s.items.length > 0)

  const saveRoom = () => {
    if (!draft) return
    startTransition(async () => {
      const result = await saveRoomAction(draft.id, draft)
      if (!result.ok) {
        setMessage(result.error ?? 'Không lưu được')
        setFieldErrors(result.fieldErrors ?? {})
        return
      }
      setDraft(null)
      setFieldErrors({})
      setMessage('')
      router.refresh()
    })
  }

  const saveGroup = () => {
    if (!groupDraft) return
    startTransition(async () => {
      const result = await saveRoomGroupAction(groupDraft.id, groupDraft.name)
      if (!result.ok) {
        setMessage(result.error ?? 'Không lưu được')
        return
      }
      setGroupDraft(null)
      setMessage('')
      router.refresh()
    })
  }

  const removeRoom = (room: RoomRow) => {
    if (!confirm(`Xoá phòng "${room.name}"?`)) return
    startTransition(async () => {
      const result = await deleteRoomAction(room.id)
      if (!result.ok) setMessage(result.error ?? 'Không xoá được')
      router.refresh()
    })
  }

  const removeGroup = (group: RoomGroupRow) => {
    if (!confirm(`Xoá nhóm "${group.name}"? Phòng trong nhóm vẫn giữ nguyên.`)) return
    startTransition(async () => {
      const result = await deleteRoomGroupAction(group.id)
      setMessage(result.error ?? '')
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          Phòng thuộc <strong className="text-foreground font-medium">{branchName}</strong>.
          Mỗi buổi dịch vụ được xếp vào một phòng để không trùng chỗ.
        </p>
        {canManage && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => { setMessage(''); setGroupDraft({ id: null, name: '' }) }}>
              <Plus className="size-4" /> Nhóm
            </Button>
            <Button size="sm" onClick={() => { setMessage(''); setFieldErrors({}); setDraft(EMPTY_ROOM) }}>
              <Plus className="size-4" /> Thêm phòng
            </Button>
          </div>
        )}
      </div>

      {message && (
        <p role="status" className="text-warning bg-warning/10 rounded-md px-4 py-3 text-sm">
          {message}
        </p>
      )}

      {rooms.length === 0 && groups.length === 0 ? (
        <p className="text-muted-foreground border-border rounded-lg border border-dashed px-4 py-12 text-center text-sm">
          Chưa khai phòng nào. Lịch hẹn cần phòng để tránh xếp hai khách vào cùng chỗ.
        </p>
      ) : (
        <div className="space-y-4">
          {sections.map(({ group, items }) => (
            <section key={group?.id ?? 'ungrouped'} className="border-border bg-card rounded-lg border">
              <div className="border-border flex items-center justify-between gap-3 border-b px-4 py-2.5">
                <h2 className="text-sm font-medium">
                  {group?.name ?? 'Chưa phân nhóm'}
                  <span className="text-muted-foreground ml-2 text-xs font-normal">
                    {items.length} phòng
                  </span>
                </h2>
                {canManage && group && (
                  <span className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Sửa nhóm"
                      onClick={() => setGroupDraft({ id: group.id, name: group.name })}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Xoá nhóm"
                      onClick={() => removeGroup(group)}
                      className="text-muted-foreground hover:text-danger"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </span>
                )}
              </div>

              {items.length === 0 ? (
                <p className="text-muted-foreground px-4 py-6 text-center text-sm">
                  Nhóm này chưa có phòng nào.
                </p>
              ) : (
                <ul className="divide-border divide-y">
                  {items.map((room) => (
                    <li key={room.id} className="flex items-center gap-3 px-4 py-3">
                      <span className="text-muted-foreground tabular w-8 shrink-0 text-xs">
                        {room.sortOrder}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {room.name}
                          {!room.isActive && (
                            <span className="ml-2 font-normal">
                              <Badge>Ngừng dùng</Badge>
                            </span>
                          )}
                        </span>
                        {room.note && (
                          <span className="text-muted-foreground block truncate text-xs">
                            {room.note}
                          </span>
                        )}
                      </span>
                      {canManage && (
                        <span className="flex shrink-0 items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Sửa"
                            onClick={() =>
                              setDraft({
                                id: room.id,
                                name: room.name,
                                note: room.note ?? '',
                                groupId: room.groupId ?? '',
                                sortOrder: String(room.sortOrder),
                                isActive: room.isActive,
                              })
                            }
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Xoá"
                            onClick={() => removeRoom(room)}
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
            </section>
          ))}
        </div>
      )}

      <Dialog open={draft !== null} onOpenChange={(open) => !open && setDraft(null)}>
        {draft && (
          <DialogContent
            title={draft.id ? 'Sửa phòng' : 'Thêm phòng'}
            description={branchName}
            footer={
              <>
                <Button variant="outline" size="sm" onClick={() => setDraft(null)}>
                  Huỷ
                </Button>
                <Button size="sm" onClick={saveRoom} disabled={pending}>
                  {pending ? 'Đang lưu…' : 'Lưu'}
                </Button>
              </>
            }
          >
            <div className="space-y-4">
              {/* Lỗi phải nằm TRONG hộp thoại: banner ở trang phía sau bị lớp
                  phủ che, người dùng chỉ thấy hộp thoại đứng im. */}
              {message && (
                <p role="alert" className="text-danger bg-danger/10 rounded-md px-3 py-2 text-sm">
                  {message}
                </p>
              )}

              <Field label="Tên phòng" required error={fieldErrors.name}>
                <TextInput
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="Phòng 1"
                  autoFocus
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Nhóm" error={fieldErrors.groupId}>
                  <Select
                    value={draft.groupId}
                    onChange={(e) => setDraft({ ...draft, groupId: e.target.value })}
                    options={groups.map((g) => ({ value: g.id, label: g.name }))}
                    placeholder="— Chưa phân nhóm —"
                  />
                </Field>

                <Field
                  label="Số thứ tự"
                  error={fieldErrors.sortOrder}
                  hint="Số nhỏ hiện trước trên lưới lịch hẹn"
                >
                  <TextInput
                    type="number"
                    min={0}
                    value={draft.sortOrder}
                    onChange={(e) => setDraft({ ...draft, sortOrder: e.target.value })}
                    className="w-28"
                  />
                </Field>
              </div>

              <Field label="Ghi chú" error={fieldErrors.note}>
                <TextArea
                  value={draft.note}
                  onChange={(e) => setDraft({ ...draft, note: e.target.value })}
                  placeholder="Ví dụ: có máy Hydrafacial, chỉ dùng cho liệu trình mặt"
                />
              </Field>

              <Toggle
                checked={draft.isActive}
                onChange={(v) => setDraft({ ...draft, isActive: v })}
                label="Đang sử dụng"
                hint="Bỏ chọn để tạm ẩn khỏi lưới xếp lịch mà không xoá lịch sử"
              />
            </div>
          </DialogContent>
        )}
      </Dialog>

      <Dialog open={groupDraft !== null} onOpenChange={(open) => !open && setGroupDraft(null)}>
        {groupDraft && (
          <DialogContent
            title={groupDraft.id ? 'Sửa nhóm vị trí' : 'Thêm nhóm vị trí'}
            footer={
              <>
                <Button variant="outline" size="sm" onClick={() => setGroupDraft(null)}>
                  Huỷ
                </Button>
                <Button size="sm" onClick={saveGroup} disabled={pending}>
                  {pending ? 'Đang lưu…' : 'Lưu'}
                </Button>
              </>
            }
          >
            <div className="space-y-4">
            {message && (
              <p role="alert" className="text-danger bg-danger/10 rounded-md px-3 py-2 text-sm">
                {message}
              </p>
            )}
            <Field label="Tên nhóm" required hint="Ví dụ: Tầng 1, Khu VIP, Phòng xông hơi">
              <TextInput
                value={groupDraft.name}
                onChange={(e) => setGroupDraft({ ...groupDraft, name: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    saveGroup()
                  }
                }}
                autoFocus
              />
            </Field>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  )
}
