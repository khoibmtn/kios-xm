import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { GoogleDriveAdapter } from './google-drive'

/**
 * Bài kiểm cho `ensureRootFolder`, viết sau khi lỗi đã xảy ra thật.
 *
 * Ngày 12/09 anh Khôi bấm "Kết nối lại Google Drive". Ứng dụng **tạo một thư
 * mục gốc mới** thay vì dùng lại thư mục cũ, nên 9 bản sao lưu và toàn bộ ảnh
 * khách nằm lại trong thư mục cũ còn ứng dụng trỏ vào một thư mục rỗng. Không
 * có lỗi nào được ném ra. Không có cảnh báo nào. Dấu hiệu duy nhất là
 * `list('backups')` trả về 0 — mà chẳng ai gọi nó hằng ngày.
 *
 * Vì sao `tsc`, lint và mọi kiểm thử cũ đều im: hàm chỉ có hai dòng và **cả
 * hai đều đúng cú pháp lẫn đúng kiểu**. Nó làm đúng thứ nó nói, chỉ là thứ nó
 * nói thì sai. ⇒ Muốn bắt được nhóm lỗi này thì phải khẳng định **hàm gọi ra
 * ngoài những gì** — nên bài kiểm dưới đây bắt `fetch` và soi từng lượt gọi.
 */

type Reply = { status?: number; body?: unknown }
let calls: string[] = []
let replies: (url: string, init?: RequestInit) => Reply
const realFetch = globalThis.fetch

beforeEach(() => {
  calls = []
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url)
    // Lượt đổi refresh token → access token, không tính vào phép đếm
    if (u.startsWith('https://oauth2.googleapis.com/token')) {
      return new Response(JSON.stringify({ access_token: 'x', expires_in: 3600 }), { status: 200 })
    }
    calls.push(`${init?.method ?? 'GET'} ${u}`)
    const r = replies(u, init)
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status ?? 200 })
  }) as typeof fetch
})

afterEach(() => {
  globalThis.fetch = realFetch
})

const adapter = (rootFolderId?: string) =>
  new GoogleDriveAdapter({
    clientId: 'id',
    clientSecret: 'secret',
    refreshToken: 'refresh',
    rootFolderId,
  })

const taoFolder = () => calls.filter((c) => c.startsWith('POST') && c.includes('/files?fields=id'))

describe('ensureRootFolder', () => {
  it('dùng lại id đang có khi thư mục còn sống — không tạo gì thêm', async () => {
    replies = (u) =>
      u.includes('/files/CU') ? { body: { id: 'CU', trashed: false } } : { body: {} }

    assert.equal(await adapter('CU').ensureRootFolder(), 'CU')
    assert.equal(taoFolder().length, 0, 'không được tạo thư mục nào')
  })

  it('KHÔNG tạo mới khi đã có thư mục cùng tên — đây chính là lỗi 12/09', async () => {
    replies = (u) => {
      if (u.includes('q=')) return { body: { files: [{ id: 'CU' }] } }
      return { body: {} }
    }

    // Đúng cảnh mà callback cũ gây ra: dựng adapter không truyền id
    assert.equal(await adapter().ensureRootFolder(), 'CU')
    assert.equal(taoFolder().length, 0, 'phải tìm ra thư mục cũ chứ không tạo cái thứ hai')
  })

  it('bỏ id đã chết rồi lùi về tìm theo tên', async () => {
    replies = (u) => {
      if (u.includes('/files/RAC')) return { status: 404 } // Drive khác / đã xoá
      if (u.includes('q=')) return { body: { files: [{ id: 'CU' }] } }
      return { body: {} }
    }

    assert.equal(await adapter('RAC').ensureRootFolder(), 'CU')
    assert.equal(taoFolder().length, 0)
  })

  it('coi thư mục trong thùng rác là đã chết', async () => {
    replies = (u) => {
      if (u.includes('/files/CU')) return { body: { id: 'CU', trashed: true } }
      if (u.includes('q=')) return { body: { files: [] } }
      return { body: { id: 'MOI' } }
    }

    assert.equal(await adapter('CU').ensureRootFolder(), 'MOI')
    assert.equal(taoFolder().length, 1, 'không còn gì để dùng lại thì mới được tạo')
  })

  it('chỉ tạo mới khi thật sự chưa có gì', async () => {
    replies = (u) => (u.includes('q=') ? { body: { files: [] } } : { body: { id: 'MOI' } })

    assert.equal(await adapter().ensureRootFolder(), 'MOI')
    assert.equal(taoFolder().length, 1)
  })

  it('lấy thư mục cũ NHẤT — đó là thư mục chứa dữ liệu', async () => {
    replies = (u) => (u.includes('q=') ? { body: { files: [{ id: 'CU' }] } } : { body: {} })

    await adapter().ensureRootFolder()
    const timKiem = calls.find((c) => c.includes('q='))
    assert.ok(timKiem, 'phải có một lượt tìm')
    assert.match(timKiem, /orderBy=createdTime(?!%20desc|\+desc)/, 'sắp xếp tăng dần theo ngày tạo')
  })
})
