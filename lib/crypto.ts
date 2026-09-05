/**
 * Mã hoá dữ liệu nhạy cảm trước khi lưu vào cơ sở dữ liệu (refresh token Google).
 *
 * Dùng Web Crypto (AES-256-GCM) thay vì `node:crypto` để chạy được cả trên
 * Node lẫn Cloudflare Workers.
 *
 * Khoá lấy từ ENCRYPTION_KEY (32 byte, mã hoá base64).
 */

const ALGO = 'AES-GCM'
const IV_BYTES = 12

async function getKey(): Promise<CryptoKey> {
  const raw = process.env.ENCRYPTION_KEY
  if (!raw) throw new Error('Thiếu biến môi trường ENCRYPTION_KEY')

  const bytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0))
  if (bytes.length !== 32) {
    throw new Error('ENCRYPTION_KEY phải là 32 byte mã hoá base64 (openssl rand -base64 32)')
  }

  return crypto.subtle.importKey('raw', bytes, ALGO, false, ['encrypt', 'decrypt'])
}

function toBase64(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}

function fromBase64(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
}

/** Trả về chuỗi base64 gồm IV nối với bản mã. */
export async function encryptSecret(plain: string): Promise<string> {
  const key = await getKey()
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const encoded = new TextEncoder().encode(plain)

  const cipher = await crypto.subtle.encrypt({ name: ALGO, iv }, key, encoded)

  const combined = new Uint8Array(iv.length + cipher.byteLength)
  combined.set(iv, 0)
  combined.set(new Uint8Array(cipher), iv.length)

  return toBase64(combined)
}

export async function decryptSecret(payload: string): Promise<string> {
  const key = await getKey()
  const combined = fromBase64(payload)

  const iv = combined.slice(0, IV_BYTES)
  const cipher = combined.slice(IV_BYTES)

  const plain = await crypto.subtle.decrypt({ name: ALGO, iv }, key, cipher)
  return new TextDecoder().decode(plain)
}
