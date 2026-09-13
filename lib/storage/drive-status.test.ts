import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { assessDrive } from './drive-status'

/**
 * Mốc thời gian lấy đúng theo sự cố thật để bài kiểm có nghĩa:
 * kết nối 05/09, hết hạn 12/09, sao lưu cuối 11/09, email báo lỗi 13/09.
 */
const NGAY = 86_400_000
const d = (iso: string) => new Date(iso)

/**
 * Mặc định là một hệ thống khoẻ mạnh: sao lưu **luôn vừa chạy đêm qua**, tính
 * theo `now` chứ không ghim cứng một ngày. Ghim cứng thì mỗi lần đẩy `now` tới
 * tương lai để thử đếm ngược, bản sao lưu lại hoá cũ và ca kiểm thử đo nhầm
 * thứ khác. Mỗi ca dưới đây chỉ đổi đúng một biến nó quan tâm.
 */
const co = (over: Partial<Parameters<typeof assessDrive>[0]> = {}) => {
  const now = over.now ?? d('2026-09-13T03:00:00Z')
  return assessDrive({
    connectedAt: d('2026-09-12T12:20:00Z'),
    connectedEmail: 'nguyenthithuhuong.k31h@gmail.com',
    lastBackupAt: new Date(now.getTime() - 4 * 3_600_000), // 02:00 đêm qua
    oauthPublished: false,
    ...over,
    now,
  })
}

describe('Đánh giá sức khoẻ sao lưu', () => {
  it('bình thường khi kết nối còn hạn và vừa sao lưu xong', () => {
    const s = co()
    assert.equal(s.level, 'ok')
    assert.match(s.headline, /bình thường/)
    assert.ok(s.expiresInDays! > 6, 'còn gần đủ 7 ngày')
  })

  it('báo đỏ khi chưa kết nối bao giờ', () => {
    const s = co({ connectedAt: null, lastBackupAt: null })
    assert.equal(s.level, 'error')
    assert.match(s.headline, /Chưa kết nối/)
    assert.match(s.action ?? '', /Thiết lập → Lưu trữ/)
  })

  it('dựng lại đúng sự cố 13/09: kết nối 05/09 thì tới 12/09 là hết hạn', () => {
    const s = co({
      connectedAt: d('2026-09-05T14:40:00Z'),
      lastBackupAt: d('2026-09-11T21:24:00Z'),
      now: d('2026-09-13T03:00:00Z'),
    })
    assert.equal(s.level, 'error')
    assert.match(s.headline, /đã hết hạn/)
    assert.ok(s.expiresInDays! < 0)
  })

  it('nhắc trước khi còn 2 ngày — để còn kịp bấm', () => {
    const s = co({ now: d('2026-09-17T12:20:00Z') }) // kết nối 12/09 → còn 2 ngày
    assert.equal(s.level, 'warn')
    assert.match(s.headline, /còn 2 ngày/)
  })

  it('không nhắc khi vẫn còn 3 ngày — nhắc sớm quá thì thành tiếng ồn', () => {
    const s = co({ now: d('2026-09-16T12:20:00Z') })
    assert.equal(s.level, 'ok')
  })

  it('nói "trong hôm nay" khi chưa tới 1 ngày', () => {
    const s = co({ now: d('2026-09-19T06:00:00Z') })
    assert.equal(s.level, 'warn')
    assert.match(s.headline, /trong hôm nay/)
  })

  it('sao lưu quá hai đêm là đỏ, kể cả khi kết nối còn hạn', () => {
    const s = co({
      connectedAt: d('2026-09-13T00:00:00Z'), // vừa kết nối, còn 7 ngày
      lastBackupAt: d('2026-09-10T02:00:00Z'),
      now: d('2026-09-13T03:00:00Z'),
    })
    assert.equal(s.level, 'error')
    assert.match(s.headline, /3 ngày không có bản sao lưu/)
  })

  it('kết nối rồi mà chưa lần nào sao lưu thì chỉ nhắc nhẹ', () => {
    const s = co({ lastBackupAt: null })
    assert.equal(s.level, 'warn')
    assert.match(s.headline, /Chưa có bản sao lưu/)
  })

  it('publish rồi thì bỏ hẳn đếm ngược — token không còn hết hạn', () => {
    const s = co({
      oauthPublished: true,
      connectedAt: d('2026-01-01T00:00:00Z'), // rất cũ, nhưng không sao
      lastBackupAt: d('2026-09-13T02:50:00Z'),
    })
    assert.equal(s.level, 'ok')
    assert.equal(s.expiresInDays, null)
  })

  it('sao lưu hỏng vẫn được báo kể cả khi đã publish', () => {
    const s = co({
      oauthPublished: true,
      connectedAt: d('2026-01-01T00:00:00Z'),
      lastBackupAt: d('2026-09-09T02:00:00Z'),
      now: d('2026-09-13T03:00:00Z'),
    })
    assert.equal(s.level, 'error')
    assert.match(s.headline, /không có bản sao lưu/)
  })

  it('hết hạn được báo trước cả sao lưu cũ — nó là nguyên nhân, không phải triệu chứng', () => {
    const s = co({
      connectedAt: d('2026-09-01T00:00:00Z'),
      lastBackupAt: d('2026-09-05T02:00:00Z'),
      now: d('2026-09-13T03:00:00Z'),
    })
    assert.equal(s.level, 'error')
    assert.match(s.headline, /đã hết hạn/, 'phải chỉ ra nguyên nhân gốc')
  })

  it('tính số ngày theo giờ thật, không làm tròn lên', () => {
    const s = co({ now: new Date(d('2026-09-12T12:20:00Z').getTime() + 6.5 * NGAY) })
    assert.ok(s.expiresInDays! > 0.4 && s.expiresInDays! < 0.6, `nhận ${s.expiresInDays}`)
  })
})
