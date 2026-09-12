import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Kết quả dựng cho Cloudflare — mã sinh tự động, không phải mã của dự án.
    // Không bỏ qua thì 206 lỗi của nó nhấn chìm vài lỗi thật của mình.
    ".open-next/**",
    ".wrangler/**",
    // Dữ liệu thật và mấy script dùng một lần quanh nó — không phải mã dự án.
    ".local-data/**",
  ]),
]);

export default eslintConfig;
