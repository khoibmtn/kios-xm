'use client'

import { useActionState, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useFormStatus } from 'react-dom'
import { Plus, Trash2 } from 'lucide-react'
import { Field, MoneyInput, Select, TextArea, TextInput, Toggle } from '@/components/form/fields'
import { Badge } from '@/components/data-table/filters'
import { formatMoney, formatPercent } from '@/lib/format'
import { KIND_LABEL, KIND_ORDER, KIND_TONE } from '@/lib/catalog/labels'
import { allocatePackageValue } from '@/lib/catalog/package-allocation'
import { saveProductAction, type ActionState } from './actions'
import type { Option, ProductFormData, ServiceOption } from './form-data'

interface Props {
  initial: ProductFormData
  categories: Option[]
  brands: Option[]
  units: Option[]
  services: ServiceOption[]
  materials: ServiceOption[]
}

function SubmitButton({ isEdit }: { isEdit: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-5 py-2.5 text-sm font-medium disabled:opacity-60"
    >
      {pending ? 'Đang lưu…' : isEdit ? 'Lưu thay đổi' : 'Thêm hàng hoá'}
    </button>
  )
}

export function ProductForm({ initial, categories, brands, units, services, materials }: Props) {
  const router = useRouter()
  const isEdit = !!initial.id
  const [form, setForm] = useState<ProductFormData>(initial)

  const action = saveProductAction.bind(null, initial.id ?? null)
  const [state, formAction] = useActionState<ActionState, FormData>(
    async (prev, fd) => {
      const result = await action(prev, fd)
      if (result.savedId) router.push(`/admin/products/${result.savedId}`)
      return result
    },
    {},
  )

  const set = <K extends keyof ProductFormData>(key: K, value: ProductFormData[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const err = (path: string) => state.fieldErrors?.[path]

  /** Xem trước phân bổ ngay khi nhập, để chủ spa thấy con số trước khi lưu. */
  const allocation = useMemo(() => {
    if (form.kind !== 'package') return null
    const parts = form.components
      .filter((c) => c.serviceId && Number(c.sessions) > 0)
      .map((c) => ({
        serviceId: c.serviceId,
        serviceName: services.find((s) => s.value === c.serviceId)?.label ?? '',
        sessions: Number(c.sessions),
        bonusSessions: Number(c.bonusSessions) || 0,
        retailPrice: Number(c.retailPrice) || 0,
      }))
    if (parts.length === 0 || !form.basePrice) return null
    try {
      return allocatePackageValue(Number(form.basePrice), parts)
    } catch {
      return null
    }
  }, [form.kind, form.components, form.basePrice, services])

  const needsValidityValue = form.validityType === 'days' || form.validityType === 'months'

  return (
    <form action={formAction} className="space-y-6">
      {/* Giá trị cho server action */}
      <input type="hidden" name="kind" value={form.kind} />
      <input type="hidden" name="isActive" value={String(form.isActive)} />
      <input type="hidden" name="allowsSale" value={String(form.allowsSale)} />
      {form.kind === 'product' && (
        <input type="hidden" name="trackInventory" value={String(form.trackInventory)} />
      )}
      {form.kind === 'package' && (
        <input
          type="hidden"
          name="components"
          value={JSON.stringify(
            form.components.map((c) => ({
              serviceId: c.serviceId,
              sessions: Number(c.sessions) || 0,
              bonusSessions: Number(c.bonusSessions) || 0,
              retailPrice: c.retailPrice,
            })),
          )}
        />
      )}
      {form.kind === 'service' && (
        <input
          type="hidden"
          name="materials"
          value={JSON.stringify(
            form.materials.map((m) => ({
              materialId: m.materialId,
              quantity: Number(m.quantity) || 0,
            })),
          )}
        />
      )}

      {/* Chọn loại — quyết định toàn bộ phần còn lại của form */}
      <section className="border-border bg-card rounded-lg border p-5">
        <h2 className="font-semibold">Loại hàng hoá</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Mỗi loại có cách bán và cách tính khác nhau, nên chọn đúng ngay từ đầu.
          {isEdit && ' Đổi loại sẽ xoá các thiết lập riêng của loại cũ.'}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {KIND_ORDER.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => set('kind', k)}
              className={`rounded-md border px-4 py-2 text-sm transition ${
                form.kind === k
                  ? 'border-primary bg-primary/10 text-primary font-medium'
                  : 'border-border hover:bg-muted'
              }`}
            >
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>
      </section>

      {state.error && (
        <p role="alert" className="text-danger bg-danger/10 rounded-md px-4 py-3 text-sm">
          {state.error}
        </p>
      )}

      {/* Thông tin chung */}
      <section className="border-border bg-card space-y-4 rounded-lg border p-5">
        <h2 className="font-semibold">Thông tin chung</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tên hàng" required error={err('name')} className="sm:col-span-2">
            <TextInput
              name="name"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Ví dụ: Chăm sóc da mụn chuyên sâu (Buổi)"
              autoFocus
            />
          </Field>

          <Field
            label="Mã hàng"
            error={err('code')}
            hint={isEdit ? undefined : 'Để trống thì hệ thống tự sinh'}
          >
            <TextInput
              name="code"
              value={form.code}
              onChange={(e) => set('code', e.target.value.toUpperCase())}
              placeholder="Tự sinh"
            />
          </Field>

          <Field label="Nhóm hàng" error={err('categoryId')}>
            <Select
              name="categoryId"
              value={form.categoryId}
              onChange={(e) => set('categoryId', e.target.value)}
              options={categories}
              placeholder="— Chưa phân nhóm —"
            />
          </Field>

          <Field label="Giá bán" required error={err('basePrice')}>
            <MoneyInput
              name="basePrice"
              value={form.basePrice}
              onChange={(v) => set('basePrice', v)}
            />
          </Field>

          {(form.kind === 'product' || form.kind === 'service') && (
            <Field
              label="Giá vốn"
              error={err('cost')}
              hint={form.kind === 'service' ? 'Chi phí nguyên vật liệu ước tính cho một buổi' : undefined}
            >
              <MoneyInput name="cost" value={form.cost} onChange={(v) => set('cost', v)} />
            </Field>
          )}

          <Field label="Đơn vị tính" error={err('unitId')}>
            <Select
              name="unitId"
              value={form.unitId}
              onChange={(e) => set('unitId', e.target.value)}
              options={units}
              placeholder="— Chọn đơn vị —"
            />
          </Field>

          {form.kind === 'product' && (
            <Field label="Thương hiệu" error={err('brandId')}>
              <Select
                name="brandId"
                value={form.brandId}
                onChange={(e) => set('brandId', e.target.value)}
                options={brands}
                placeholder="— Không có —"
              />
            </Field>
          )}

          <Field label="Mô tả" error={err('description')} className="sm:col-span-2">
            <TextArea
              name="description"
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="Mô tả ngắn hiển thị cho nhân viên khi bán"
            />
          </Field>
        </div>
      </section>

      {/* ── Riêng cho dịch vụ ── */}
      {form.kind === 'service' && (
        <section className="border-border bg-card space-y-4 rounded-lg border p-5">
          <div>
            <h2 className="font-semibold">Thiết lập dịch vụ</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Thời lượng quyết định độ dài khối trên lưới lịch hẹn và giờ kết thúc gợi ý
              khi xếp lịch.
            </p>
          </div>

          <Field label="Thời lượng (phút)" required error={err('durationMinutes')}>
            <div className="flex flex-wrap items-center gap-2">
              <TextInput
                name="durationMinutes"
                type="number"
                min={5}
                max={600}
                step={5}
                value={form.durationMinutes}
                onChange={(e) => set('durationMinutes', e.target.value)}
                className="w-32"
              />
              {[30, 60, 90, 120].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => set('durationMinutes', String(m))}
                  className="border-border hover:bg-muted rounded-md border px-3 py-1.5 text-sm"
                >
                  {m >= 60 ? `${m / 60}h${m % 60 ? `${m % 60}'` : ''}` : `${m}'`}
                </button>
              ))}
            </div>
          </Field>

          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Định mức nguyên vật liệu</h3>
              <button
                type="button"
                onClick={() =>
                  set('materials', [...form.materials, { materialId: '', quantity: '1' }])
                }
                className="text-primary inline-flex items-center gap-1 text-sm hover:underline"
              >
                <Plus className="size-4" /> Thêm dòng
              </button>
            </div>
            <p className="text-muted-foreground mt-1 text-xs">
              Làm xong một buổi sẽ trừ kho theo đúng định mức này.
            </p>

            {form.materials.length === 0 ? (
              <p className="text-muted-foreground border-border mt-3 rounded-md border border-dashed px-4 py-6 text-center text-sm">
                Chưa khai định mức — buổi làm sẽ không trừ kho.
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                {form.materials.map((m, i) => (
                  <div key={i} className="flex flex-wrap items-start gap-2">
                    <div className="min-w-[12rem] flex-1">
                      <Select
                        value={m.materialId}
                        onChange={(e) => {
                          const next = [...form.materials]
                          next[i] = { ...next[i], materialId: e.target.value }
                          set('materials', next)
                        }}
                        options={materials}
                        placeholder="— Chọn nguyên vật liệu —"
                      />
                      {err(`materials.${i}.materialId`) && (
                        <p className="text-danger mt-1 text-xs">{err(`materials.${i}.materialId`)}</p>
                      )}
                    </div>
                    <TextInput
                      type="number"
                      step="0.001"
                      min="0"
                      value={m.quantity}
                      onChange={(e) => {
                        const next = [...form.materials]
                        next[i] = { ...next[i], quantity: e.target.value }
                        set('materials', next)
                      }}
                      className="w-28"
                      placeholder="Số lượng"
                    />
                    <button
                      type="button"
                      onClick={() => set('materials', form.materials.filter((_, x) => x !== i))}
                      aria-label="Xoá dòng"
                      className="text-muted-foreground hover:text-danger p-2"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── Riêng cho gói ── */}
      {form.kind === 'package' && (
        <section className="border-border bg-card space-y-4 rounded-lg border p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold">Thành phần gói</h2>
              <p className="text-muted-foreground mt-1 text-sm">
                Chọn dịch vụ và số buổi. Giá lẻ dùng để phân bổ giá trị mỗi buổi.
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                set('components', [
                  ...form.components,
                  { serviceId: '', sessions: '1', bonusSessions: '0', retailPrice: '' },
                ])
              }
              className="text-primary inline-flex shrink-0 items-center gap-1 text-sm hover:underline"
            >
              <Plus className="size-4" /> Thêm dịch vụ
            </button>
          </div>

          {err('components') && <p className="text-danger text-sm">{err('components')}</p>}

          {form.components.length === 0 ? (
            <p className="text-muted-foreground border-border rounded-md border border-dashed px-4 py-6 text-center text-sm">
              Gói phải có ít nhất một dịch vụ.
            </p>
          ) : (
            <div className="space-y-3">
              {form.components.map((c, i) => (
                <div key={i} className="border-border rounded-md border p-3">
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="min-w-[14rem] flex-1">
                      <Field label="Dịch vụ" error={err(`components.${i}.serviceId`)}>
                        <Select
                          value={c.serviceId}
                          onChange={(e) => {
                            const next = [...form.components]
                            const svc = services.find((s) => s.value === e.target.value)
                            next[i] = {
                              ...next[i],
                              serviceId: e.target.value,
                              // Lấy sẵn giá lẻ hiện hành để đỡ phải gõ lại
                              retailPrice: c.retailPrice || (svc?.price ?? ''),
                            }
                            set('components', next)
                          }}
                          options={services}
                          placeholder="— Chọn dịch vụ —"
                        />
                      </Field>
                    </div>

                    <Field label="Số buổi" error={err(`components.${i}.sessions`)}>
                      <TextInput
                        type="number"
                        min={1}
                        value={c.sessions}
                        onChange={(e) => {
                          const next = [...form.components]
                          next[i] = { ...next[i], sessions: e.target.value }
                          set('components', next)
                        }}
                        className="w-24"
                      />
                    </Field>

                    <Field label="Tặng thêm">
                      <TextInput
                        type="number"
                        min={0}
                        value={c.bonusSessions}
                        onChange={(e) => {
                          const next = [...form.components]
                          next[i] = { ...next[i], bonusSessions: e.target.value }
                          set('components', next)
                        }}
                        className="w-24"
                      />
                    </Field>

                    <Field label="Giá lẻ" error={err(`components.${i}.retailPrice`)}>
                      <div className="w-40">
                        <MoneyInput
                          value={c.retailPrice}
                          onChange={(v) => {
                            const next = [...form.components]
                            next[i] = { ...next[i], retailPrice: v }
                            set('components', next)
                          }}
                        />
                      </div>
                    </Field>

                    <button
                      type="button"
                      onClick={() => set('components', form.components.filter((_, x) => x !== i))}
                      aria-label="Xoá dịch vụ"
                      className="text-muted-foreground hover:text-danger mb-1.5 p-2"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Xem trước phân bổ — cho thấy con số trước khi lưu */}
          {allocation && (
            <div className="bg-muted/40 border-border rounded-md border p-4">
              <h3 className="text-sm font-medium">Giá trị mỗi buổi sau khi phân bổ</h3>
              <p className="text-muted-foreground mt-0.5 text-xs">
                Đây là giá trị dùng để tính hoa hồng khi khách dùng buổi từ gói.
              </p>

              {allocation.warnings.map((w) => (
                <p key={w} className="text-warning bg-warning/10 mt-2 rounded px-2.5 py-1.5 text-xs">
                  {w}
                </p>
              ))}

              <ul className="mt-3 space-y-1.5 text-sm">
                {allocation.components.map((c) => (
                  <li key={c.serviceId} className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate">{c.serviceName}</span>
                    <span className="tabular shrink-0">
                      <span className="text-muted-foreground text-xs">
                        {formatPercent(c.share * 100)} ·{' '}
                      </span>
                      <span className="font-medium">{formatMoney(c.allocatedPerSession)}</span>
                      <span className="text-muted-foreground text-xs">/buổi</span>
                    </span>
                  </li>
                ))}
              </ul>

              <div className="border-border mt-3 flex items-baseline justify-between border-t pt-2 text-sm">
                <span className="text-muted-foreground">Mua rời từng buổi</span>
                <span className="tabular">{formatMoney(allocation.retailTotal)} đ</span>
              </div>
              {allocation.discountAmount > 0 && (
                <div className="text-success flex items-baseline justify-between text-sm">
                  <span>Khách tiết kiệm</span>
                  <span className="tabular font-medium">
                    {formatMoney(allocation.discountAmount)} đ (
                    {formatPercent(allocation.discountRatio * 100)})
                  </span>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* ── Riêng cho thẻ ── */}
      {form.kind === 'card' && (
        <section className="border-border bg-card space-y-4 rounded-lg border p-5">
          <div>
            <h2 className="font-semibold">Thiết lập thẻ tài khoản</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Khách trả trước một khoản, dùng dần cho mọi dịch vụ và sản phẩm.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Mệnh giá" required error={err('cardFaceValue')} hint="Số tiền khách trả">
              <MoneyInput
                name="cardFaceValue"
                value={form.cardFaceValue}
                onChange={(v) => {
                  set('cardFaceValue', v)
                  // Giá bán của thẻ chính là mệnh giá, trừ khi cố ý đặt khác
                  if (!form.basePrice || form.basePrice === form.cardFaceValue) set('basePrice', v)
                }}
              />
            </Field>

            <Field
              label="Tặng thêm"
              error={err('cardBonusValue')}
              hint="Số dư ban đầu = mệnh giá + tặng thêm"
            >
              <MoneyInput
                name="cardBonusValue"
                value={form.cardBonusValue}
                onChange={(v) => set('cardBonusValue', v)}
              />
            </Field>
          </div>

          {form.cardFaceValue && (
            <p className="bg-muted/40 rounded-md px-3 py-2 text-sm">
              Khách trả{' '}
              <strong className="tabular">{formatMoney(form.cardFaceValue)} đ</strong>, dùng được{' '}
              <strong className="tabular text-success">
                {formatMoney(Number(form.cardFaceValue) + (Number(form.cardBonusValue) || 0))} đ
              </strong>
            </p>
          )}
        </section>
      )}

      {/* ── Hạn dùng: gói và thẻ ── */}
      {(form.kind === 'package' || form.kind === 'card') && (
        <section className="border-border bg-card space-y-4 rounded-lg border p-5">
          <h2 className="font-semibold">Hạn sử dụng</h2>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Tính theo">
              <Select
                name="validityType"
                value={form.validityType}
                onChange={(e) => set('validityType', e.target.value)}
                options={[
                  { value: 'unlimited', label: 'Vô thời hạn' },
                  { value: 'days', label: 'Số ngày' },
                  { value: 'months', label: 'Số tháng' },
                ]}
              />
            </Field>
            {needsValidityValue && (
              <Field label="Số lượng" required error={err('validityValue')}>
                <TextInput
                  name="validityValue"
                  type="number"
                  min={1}
                  value={form.validityValue}
                  onChange={(e) => set('validityValue', e.target.value)}
                  className="w-28"
                />
              </Field>
            )}
          </div>
        </section>
      )}

      {/* ── Riêng cho sản phẩm ── */}
      {form.kind === 'product' && (
        <section className="border-border bg-card space-y-4 rounded-lg border p-5">
          <h2 className="font-semibold">Kho</h2>

          <Toggle
            checked={form.trackInventory}
            onChange={(v) => set('trackInventory', v)}
            label="Theo dõi tồn kho"
            hint="Trừ kho khi bán và khi dịch vụ tiêu hao"
          />

          {form.trackInventory && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Tồn tối thiểu"
                error={err('minQuantity')}
                hint="Xuống dưới mức này sẽ được đánh dấu cảnh báo"
              >
                <TextInput
                  name="minQuantity"
                  type="number"
                  min="0"
                  step="0.001"
                  value={form.minQuantity}
                  onChange={(e) => set('minQuantity', e.target.value)}
                />
              </Field>
              <Field label="Tồn tối đa" error={err('maxQuantity')}>
                <TextInput
                  name="maxQuantity"
                  type="number"
                  min="0"
                  step="0.001"
                  value={form.maxQuantity}
                  onChange={(e) => set('maxQuantity', e.target.value)}
                />
              </Field>
            </div>
          )}
        </section>
      )}

      {/* Trạng thái */}
      <section className="border-border bg-card space-y-3 rounded-lg border p-5">
        <h2 className="font-semibold">Trạng thái</h2>
        <Toggle
          checked={form.isActive}
          onChange={(v) => set('isActive', v)}
          label="Đang kinh doanh"
          hint="Bỏ chọn để ẩn khỏi danh sách mà không xoá dữ liệu lịch sử"
        />
        <Toggle
          checked={form.allowsSale}
          onChange={(v) => set('allowsSale', v)}
          label="Cho phép bán trên màn hình thu ngân"
        />
      </section>

      <div className="flex items-center gap-3">
        <SubmitButton isEdit={isEdit} />
        <button
          type="button"
          onClick={() => router.back()}
          className="border-border hover:bg-muted rounded-md border px-5 py-2.5 text-sm"
        >
          Huỷ
        </button>
        <Badge tone={KIND_TONE[form.kind]}>{KIND_LABEL[form.kind]}</Badge>
      </div>
    </form>
  )
}
