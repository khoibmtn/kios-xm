import { redirect } from 'next/navigation'

/** Mở POS là vào thẳng lịch hẹn — việc đầu tiên của lễ tân mỗi sáng. */
export default function PosIndexPage() {
  redirect('/pos/calendar')
}
