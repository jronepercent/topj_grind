# TOPJ_GRIND — เว็บแอปสมาชิก (V1)

เว็บคอร์สออนไลน์ของ JR: ใช้งานแบบ YouTube หน้าตาแบบ Apple · Next.js 15 + TypeScript + Tailwind v4 + Vidstack

## รันบนเครื่อง

```bash
npm install
npm run dev
```

เปิด http://localhost:3000 — ตอนนี้รันใน **โหมดเดโม** (`NEXT_PUBLIC_DEMO_MODE=true`) ใช้ข้อมูลตัวอย่างในเครื่อง (`.data/db.json`) ไม่ต้องต่อ Supabase/Bunny ก็ลองได้ทุกหน้า

- ปุ่ม **DEMO** มุมซ้ายล่าง: สลับมุมมอง Guest / Free / สมาชิก (เหลือ 2 วัน) / สมาชิก / Admin ได้ในคลิกเดียว
- บัญชีทดสอบ (รหัสผ่าน `demo1234`): `jr@topjgrind.com` (Admin), `member@topjgrind.test`, `soon@topjgrind.test`, `free@topjgrind.test`
- ลองยิง webhook ชำระเงิน: `npm run webhook:test -- free@topjgrind.test`
- ล้างข้อมูลเดโมกลับค่าเริ่มต้น: หยุด dev server แล้ว `npm run reset:demo`

## โครงสร้าง

| ส่วน | ที่อยู่ |
|---|---|
| หน้าคนดู | `src/app/(site)/` — Home, Watch, Shorts, Podcasts, Playlists, Search, Library, About, Membership, Account |
| Auth | `src/app/(auth)/`, `src/app/auth/magic` |
| Studio (Admin) | `src/app/studio/`, `src/components/studio/` |
| API | `/api/play/[id]` (ออก URL เล่นหลังเช็กสิทธิ์), `/api/webhooks/payment`, `/api/webhooks/bunny`, `/api/cron/*`, `/api/resources/[id]`, `/api/studio/members` |
| ข้อมูล | `src/lib/server/` — `store.ts` (ตารางเดโม), `queries.ts`, `mutations.ts`, `auth.ts`, `media.ts` (Bunny signed URL) |
| Player | `src/components/player/` — custom controls บน Vidstack + global mini player |
| Database จริง | `supabase/migrations/0001_init.sql` — schema ครบ + RLS ทุกตาราง + `apply_payment()` + pg_cron |

## ขึ้นระบบจริง (ยังต้องทำ)

1. สร้างโปรเจกต์ Supabase แล้วรัน `supabase/migrations/0001_init.sql`
2. **ย้ายชั้นข้อมูลจาก `store.ts` ไป Supabase** — `queries.ts` / `mutations.ts` / `auth.ts` เขียนให้ตรงกับ schema 1:1 แล้ว แต่ยังเรียก store เดโมอยู่ ต้องเปลี่ยนเป็น `@supabase/ssr` (ติดตั้งไว้แล้ว)
3. Bunny Stream: ใส่ค่า `BUNNY_STREAM_*` ใน `.env` → Studio อัปโหลดตรงผ่าน TUS อัตโนมัติ, `/api/play` ออก signed URL 2 ชม. · ตั้ง webhook เป็น `/api/webhooks/bunny?secret=...` · เปิด Allowed Referrer = topjgrind.com
4. พอดแคสต์: Bunny Storage ไม่มี TUS และห้ามส่ง Storage key ไปที่ browser จึงยังอัปโหลดตรงไม่ได้ — ต้องเลือกทางใดทางหนึ่ง (ดูหัวข้อด้านล่าง)
5. ตั้ง `NEXT_PUBLIC_DEMO_MODE=false`, `PAYMENT_URL`, `PAYMENT_WEBHOOK_SECRET`, `CRON_SECRET` แล้ว deploy บน Vercel (`vercel.json` มี cron ให้แล้ว)

ดูตัวแปรทั้งหมดใน `.env.example`

## ข้อที่ยังไม่ครบตาม spec

- อัปโหลดพอดแคสต์ไป Bunny Storage แบบตรงจาก browser (ข้อจำกัดของ Bunny Storage) — ทางเลือก: ใช้ Supabase Storage (รองรับ TUS) แล้ว sync ไป Bunny, หรือทำ upload proxy เล็กๆ บน Edge
- Storyboard thumbnail ตอน hover progress bar (รองรับใน Vidstack แล้ว รอไฟล์ VTT จาก Bunny)
- ไฟล์ประกอบในโหมดเดโมเป็นไฟล์ตัวอย่าง ยังไม่มีการเก็บไฟล์จริง
- ยังไม่ได้วัด Lighthouse และยังไม่ได้ทดสอบบน iPhone จริง (ฟังพอดแคสต์ตอนปิดจอ)
