/**
 * pg-cloudflare khai exports theo điều kiện "workerd", nhưng OpenNext chỉ đóng
 * gói nhánh "default" (dist/empty.js) rồi lại resolve theo nhánh workerd
 * (esm/index.mjs) — file đó không được copy nên esbuild báo không tìm thấy.
 *
 * Làm phẳng export map để mọi điều kiện đều trỏ về một file duy nhất.
 * Chạy tự động sau mỗi lần npm install.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const pkgPath = 'node_modules/pg-cloudflare/package.json'
if (!existsSync(pkgPath)) {
  console.log('pg-cloudflare chưa cài — bỏ qua')
  process.exit(0)
}

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
const flat = { '.': { default: './dist/index.js' }, './package.json': './package.json' }

if (JSON.stringify(pkg.exports) === JSON.stringify(flat)) {
  console.log('pg-cloudflare: đã làm phẳng từ trước')
  process.exit(0)
}

pkg.exports = flat
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
console.log('pg-cloudflare: đã làm phẳng export map cho OpenNext')
