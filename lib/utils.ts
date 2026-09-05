import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Ghép class Tailwind, lớp sau thắng lớp trước.
 *
 * Cần thiết vì thứ tự trong thuộc tính `class` không quyết định gì cả: hai
 * utility cùng nhóm (`w-full` và `w-28`) có độ ưu tiên CSS như nhau, nên thứ tự
 * trong biểu định kiểu mới là thứ thắng. Nối chuỗi tay kiểu
 * `${controlClass} ${props.className}` vì thế im lặng bỏ qua ý định của người
 * gọi — ô "Số buổi" xin `w-24` vẫn giãn hết hàng và đẩy các ô sau xuống dòng.
 * `twMerge` nhận biết các nhóm đối chọi và bỏ hẳn class bị ghi đè.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
