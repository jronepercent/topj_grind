# TOPJ_GRIND — เว็บแอปสมาชิก (V1)

เว็บคอร์สออนไลน์ของ JR: ใช้งานแบบ YouTube หน้าตาแบบ Apple · Next.js 15 + TypeScript + Tailwind v4 + Vidstack

## รันบนเครื่อง

ต้องมี `.env.local` ครบตาม `.env.example` (Supabase + Bunny) ก่อน — ดู [docs/setup-accounts.md](docs/setup-accounts.md)

```bash
npm install
npm run db:migrate      # สร้าง/อัปเดตตารางใน Supabase (มี --dry-run)
npm run db:seed         # ใส่คลิปตัวอย่าง + บัญชีทดลอง (ครั้งแรกเท่านั้น)
npm run dev
```

| คำสั่ง | ทำอะไร |
|---|---|
| `npm run db:migrate` | รันไฟล์ใน `supabase/migrations` ที่ยังไม่เคยรัน (ทีละไฟล์ใน transaction) |
| `npm run db:test-rls` | ทดสอบสิทธิ์ 24 กรณีกับฐานข้อมูลจริง แล้ว rollback ไม่ทิ้งข้อมูล |
| `npm run db:seed` | ใส่ข้อมูลตัวอย่าง · `-- --force` ใส่ใหม่ · `-- --remove` ลบออกทั้งหมด |
| `npm run db:make-admin -- อีเมล` | ให้สิทธิ์ Studio กับบัญชีที่สมัครแล้ว (ใช้กับบัญชีจริงของ JR) |
| `npm run webhook:test -- อีเมล` | ยิง webhook ชำระเงินทดสอบ |

**โหมดเดโม** (`NEXT_PUBLIC_DEMO_MODE=true`): ปุ่ม DEMO มุมซ้ายล่างสลับเข้าบัญชีทดลอง (`admin@ / member@ / soon@ / free@topjgrind.test`) รหัสผ่านอยู่ใน `DEMO_PASSWORD` ใน `.env.local`
⚠️ **ก่อนเปิดเว็บจริง:** `npm run db:seed -- --remove` และตั้ง `NEXT_PUBLIC_DEMO_MODE=false` — บัญชีทดลองเป็นผู้ใช้จริงในฐานข้อมูลจริง (รวม admin ทดลอง)

## โครงสร้าง

| ส่วน | ที่อยู่ |
|---|---|
| หน้าคนดู | `src/app/(site)/` — Home, Watch, Shorts, Podcasts, Playlists, Search, Library, About, Membership, Account |
| Auth | `src/app/(auth)/`, `src/app/auth/magic` |
| Studio (Admin) | `src/app/studio/`, `src/components/studio/` |
| API | `/api/play/[id]` (ออก URL เล่นหลังเช็กสิทธิ์), `/api/webhooks/payment`, `/api/webhooks/bunny`, `/api/cron/*`, `/api/resources/[id]`, `/api/studio/members` |
| ข้อมูล | `src/lib/supabase/clients.ts` (userDb = สิทธิ์ผู้ใช้/RLS, adminDb = service role) · `src/lib/server/` — `queries.ts` (catalogue cache 30 วิ), `mutations.ts`, `auth.ts` (Supabase Auth), `media.ts`, `bunny.ts` |
| Player | `src/components/player/` — custom controls บน Vidstack + global mini player |
| Database จริง | `supabase/migrations/0001_init.sql` — schema ครบ + RLS ทุกตาราง + `apply_payment()` + pg_cron |

## ขึ้นระบบจริง (ยังต้องทำ)

1. ตั้ง SMTP ของตัวเองใน Supabase (Auth → SMTP) — SMTP ฟรีของ Supabase ส่งอีเมลได้แค่ไม่กี่ฉบับต่อชั่วโมง ไม่พอสำหรับสมัคร/ลืมรหัส
2. Deploy บน Vercel + ใส่ env ทั้งหมด · `NEXT_PUBLIC_DEMO_MODE=false` · `CRON_SECRET`
3. เพิ่มโดเมนจริงใน Supabase → Auth → URL Configuration และตั้ง Bunny webhook เป็น `https://โดเมน/api/webhooks/bunny?secret=...`
4. JR สมัครด้วยอีเมลจริง → `npm run db:make-admin -- อีเมล` → `npm run db:seed -- --remove`

## ข้อที่ยังไม่ครบตาม spec

- อัปโหลดพอดแคสต์ไป Bunny Storage แบบตรงจาก browser (ข้อจำกัดของ Bunny Storage) — ทางเลือก: ใช้ Supabase Storage (รองรับ TUS) แล้ว sync ไป Bunny, หรือทำ upload proxy เล็กๆ บน Edge
- Storyboard thumbnail ตอน hover progress bar (รองรับใน Vidstack แล้ว รอไฟล์ VTT จาก Bunny)
- ไฟล์ประกอบ: ดาวน์โหลดผ่าน Supabase Storage (signed URL 10 นาที) ได้แล้ว แต่ Studio ยังไม่มีปุ่มอัปโหลดไฟล์จริง
- ยังไม่ได้วัด Lighthouse และยังไม่ได้ทดสอบบน iPhone จริง (ฟังพอดแคสต์ตอนปิดจอ)
