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
| `npm run webhook:test -- <email> [monthly\|yearly] [card\|promptpay] [reference] [--amount=N]` | ยิง webhook ชำระเงินทดสอบ (ราคาแพ็กเกจอยู่ใน `src/lib/plans.ts`) |
| `npm run webhook:test -- --kohort <email> [monthly\|yearly] [card\|promptpay] [reference] [--amount=N] [--json] [--no-ref]` | ยิง webhook แบบ Kohort (secret ใน query, อ่าน `KOHORT_WEBHOOK_SECRET` จาก `.env.local`) |
| `npm run webhook:test -- <email> [card\|promptpay] --product=<id> --price=<ราคา> [--amount=N]` | ยิง webhook ซื้อสินค้าในร้านค้า (id และราคาดูได้ที่ Studio → ร้านค้า) |

**โหมดเดโม** (`NEXT_PUBLIC_DEMO_MODE=true`): ปุ่ม DEMO มุมซ้ายล่างสลับเข้าบัญชีทดลอง (`admin@ / member@ / soon@ / free@topjgrind.test`) รหัสผ่านอยู่ใน `DEMO_PASSWORD` ใน `.env.local`
⚠️ **ก่อนเปิดเว็บจริง:** `npm run db:seed -- --remove` และตั้ง `NEXT_PUBLIC_DEMO_MODE=false` — บัญชีทดลองเป็นผู้ใช้จริงในฐานข้อมูลจริง (รวม admin ทดลอง)

## โครงสร้าง

| ส่วน | ที่อยู่ |
|---|---|
| หน้าคนดู | `src/app/(site)/` — Home, Watch, Community (ชุมชน/บทความ), Podcasts, Playlists, Search, Library, About, Membership, Account |
| Auth | `src/app/(auth)/`, `src/app/auth/magic` |
| Studio (Admin) | `src/app/studio/`, `src/components/studio/` |
| API | `/api/play/[id]` (ออก URL เล่นหลังเช็กสิทธิ์), `/api/webhooks/payment` (สมาชิก: `plan` · ร้านค้า: `product_id`), `/api/webhooks/kohort` (Kohort — ดูหัวข้อด้านล่าง), `/api/shop/download/[productId]` (ดาวน์โหลดสินค้าที่ซื้อ — เช็กสิทธิ์แล้วส่ง signed URL 60 วินาที), `/api/webhooks/bunny`, `/api/cron/*`, `/api/resources/[id]`, `/api/studio/members`, `/api/studio/email` (ส่งอีเมลแจ้งเตือน — ดูหัวข้อด้านล่าง), `/api/email/unsubscribe` |
| ข้อมูล | `src/lib/supabase/clients.ts` (userDb = สิทธิ์ผู้ใช้/RLS, adminDb = service role) · `src/lib/server/` — `queries.ts` (catalogue cache 30 วิ), `mutations.ts`, `auth.ts` (Supabase Auth), `media.ts`, `bunny.ts` |
| Player | `src/components/player/` — custom controls บน Vidstack + global mini player |
| Database จริง | `supabase/migrations/0001_init.sql` — schema ครบ + RLS ทุกตาราง + `apply_payment()` + pg_cron |

## รับชำระเงินผ่าน Kohort (kohort.me)

Kohort รับเงินให้ (บัตร Stripe รายเดือน, PromptPay QR, โอนพร้อมเช็กสลิป) แล้วบอกเว็บเราผ่าน webhook ที่ `/api/webhooks/kohort` — เปิดสมาชิกอัตโนมัติ รวมถึงรอบต่ออายุทุกเดือน ใช้ร่วมกับ `/api/webhooks/payment` (HMAC) เดิมได้ ไม่กระทบกัน

**ตั้งค่า (Vercel → Environment Variables)**

| ตัวแปร | ค่า |
|---|---|
| `KOHORT_WEBHOOK_SECRET` | สตริงสุ่มยาวๆ (ไม่ตั้ง = endpoint ตอบ 503) |
| `PAYMENT_URL_MONTHLY`, `PAYMENT_URL_YEARLY` | ลิงก์สินค้าของแต่ละแพ็กเกจบน Kohort (ไม่ตั้ง = ใช้ `PAYMENT_URL`) บัตรกับ PromptPay ใช้ลิงก์เดียวกัน ลูกค้าเลือกวิธีจ่ายบน Kohort |

**URL ที่ใส่ในแอคชัน "Call a webhook" ของ Kohort** (Method = POST) — Kohort ใส่ได้แค่ URL จึงให้เอา merge tag ไปไว้ใน query string:

```
https://<site>/api/webhooks/kohort?secret=<SECRET>&email={{email}}&amount={{value}}&currency={{currency}}&plan={{product_name}}&reference={{event_id}}
```

ชื่อ tag ต้องเลือกจากตัวเลือก (picker) ของ Kohort เท่านั้น — ถ้าชื่อจริงต่างจากนี้ให้ใช้ตามที่ Kohort ให้มา ระบบหาชื่อฟิลด์แบบยืดหยุ่น (`email`/`customer_email`, `amount`/`value`/`total`/`price`, `reference`/`event_id`/`payment_id`/`transaction_id`/`order_id`/…, `plan`/`product_name`/…, `method`/`payment_method`, `paid_at`/`created_at`, `product_id` สำหรับร้านค้า) ทั้งใน query และใน body (JSON / form / multipart ซ้อนหลายชั้นได้) ถ้ามีทั้งสองที่ ค่าใน body ชนะ

หากตั้ง header ได้ (หรือเรียกจากเครื่องมืออื่น) ส่ง secret เป็น `x-webhook-secret: <SECRET>` หรือ `Authorization: Bearer <SECRET>` แทน `?secret=` ก็ได้ และส่งเป็น JSON เช่น `{"email":"{{email}}","amount":"{{value}}","reference":"{{event_id}}","plan":"{{product_name}}","method":"{{payment_method}}"}`

**ระบบจับคู่แพ็กเกจอย่างไร:** `plan` = `monthly`/`yearly` ตรงๆ หรือข้อความที่มี ปี/year/annual → รายปี, เดือน/month → รายเดือน (เช่น "สมาชิก 990 บาท / เดือน ต่ออายุทุก 30 วัน"), ไม่เจอก็ดูจากยอด (990 → รายเดือน, 4,990 → รายปี) · ยอดต้องตรงกับแพ็กเกจเป๊ะ (รับ "฿990", "4,990", และถ้ายอดเป็นสตางค์ เช่น 99000 จะหาร 100 เฉพาะเมื่อได้ราคาแพ็กเกจพอดี) · สกุลเงินรับเฉพาะ THB · ไม่ส่ง `method` = บัตร

**ตอบกลับ:** `200 {"ok":true,"status":"applied" | "duplicate" | "logged"}` — `logged` คือยอดไม่ตรง/ไม่เจออีเมล/ไม่รู้จักข้อมูล บันทึกลง `payment_errors` (Studio → สมาชิก) ให้ตรวจเอง ไม่ให้ Kohort ยิงซ้ำไม่จบ · `400` เฉพาะ body อ่านไม่ได้และไม่มี query เลย · `401` secret ผิด · `503` ยังไม่ตั้ง `KOHORT_WEBHOOK_SECRET` · `5xx` ฐานข้อมูลล้มเหลว (ให้ Kohort ลองใหม่)

**ข้อมูลที่ระบบอ่านไม่ออก (ครั้งแรกที่ยังไม่รู้หน้าตา payload จริงของ Kohort):** ถ้าไม่เจออีเมล/แพ็กเกจ/ยอด ระบบเก็บ body + query (ไม่รวม secret) + content-type ทั้งหมดลง `payment_errors` (`payload.source = "kohort_unmatched"`) แล้วตอบ 200 — ดูแถวนั้นเพื่อเห็นชื่อฟิลด์จริง แล้วปรับ URL ให้ตรง

**กันจ่ายซ้ำ:** ใช้ `reference` (จาก `event_id`/`payment_id`/…) เป็นตัวกันซ้ำ ดังนั้นต้องไม่ซ้ำกันในแต่ละการตัดเงิน (ต่ออายุทุกเดือนต้องได้ id ใหม่ทุกครั้ง ไม่เช่นนั้นรอบถัดไปจะถูกมองว่าซ้ำและไม่ต่อให้) ถ้า Kohort ไม่ส่ง reference ระบบสร้างให้เป็น `kohort:` + sha256(email|amount|plan|เวลาจ่ายปัดเป็นนาที) — ถ้าไม่มีเวลามาด้วยจะปัดเป็นชั่วโมง เพื่อกัน retry ของการส่งเดียวกันไม่ให้ต่ออายุสองรอบ

**จ่ายก่อนสมัครสมาชิก (auto-claim):** ถ้าลูกค้าจ่ายบน Kohort ด้วยอีเมลที่ยังไม่มีบัญชีบนเว็บ รายการจะค้างใน `payment_errors` (เหตุผล "ไม่พบผู้ใช้", `source = "kohort"`) พอเจ้าของอีเมลนั้นยืนยันอีเมล/เข้าลิงก์ใน `/auth/callback` (หรือสมัครในกรณีปิดการยืนยันอีเมล) ระบบจะเปิดสมาชิกให้จากรายการที่ค้างแล้วติ๊ก resolved ให้เอง (ทำเฉพาะตอนที่ยังไม่เป็นสมาชิก และไม่ซ้ำเพราะกันซ้ำด้วย reference)

หน้า checkout จะบอกให้ใช้อีเมลเดียวกับบัญชีตอนจ่าย เพราะระบบจับคู่การชำระเงินกับบัญชีด้วยอีเมล

**ทดสอบ**

```bash
# ทดสอบ endpoint ยังทำงาน (ได้ "ok")
curl "https://<site>/api/webhooks/kohort"

# จำลอง Kohort: ทุกอย่างอยู่ใน URL ตัว body ว่าง
curl -X POST "https://<site>/api/webhooks/kohort?secret=<SECRET>&email=member@example.com&amount=990&currency=THB&plan=%E0%B8%A3%E0%B8%B2%E0%B8%A2%E0%B9%80%E0%B8%94%E0%B8%B7%E0%B8%AD%E0%B8%99&reference=test-001"

# เครื่องตัวเอง (อ่าน KOHORT_WEBHOOK_SECRET จาก .env.local ไม่พิมพ์ออกหน้าจอ)
npm run webhook:test -- --kohort member@example.com monthly card [reference] [--amount=N] [--json] [--no-ref]
```

## อีเมลแจ้งเตือน

ใน Studio กดปุ่ม **ส่งอีเมลแจ้งเตือน** ที่คลิป/พอดแคสต์ (ตารางคอนเทนต์และหน้าแก้ไข) บทความ (รายการและหน้าแก้ไข) หรือโพสต์ชุมชน เพื่อเลือกส่งถึง "ทุกคน" หรือ "เฉพาะสมาชิก" ดูจำนวนผู้รับ แก้หัวข้อ ดูตัวอย่าง แล้วยืนยัน — ส่งได้เฉพาะรายการที่เผยแพร่แล้ว ระบบเตือนถ้าเคยส่งรายการนี้ให้กลุ่มเดิมแล้ว และบันทึกผลทุกครั้งในตาราง `email_broadcasts`

ผู้รับ = บัญชีที่ยืนยันอีเมลแล้ว ไม่ถูกแบน และไม่ได้ปิดรับ (`profiles.email_updates`, เปิดเป็นค่าเริ่มต้น) — ผู้ใช้ปิดเองได้ที่หน้าบัญชีของฉัน หรือกด "ยกเลิกรับอีเมลแจ้งเตือน" ท้ายอีเมล (`/unsubscribe`, รองรับ one-click ตาม RFC 8058 ที่ `/api/email/unsubscribe`)

**ตั้งค่า**

1. สมัคร [Resend](https://resend.com) แล้วเพิ่มโดเมน `topjgrind.com` (Domains → Add) ใส่ DNS ที่ Resend ให้ (SPF, DKIM, และแนะนำ DMARC) จนสถานะเป็น Verified
2. สร้าง API key (Sending access) ใน Resend
3. ใส่ env บน Vercel (และ `.env.local`):

| ตัวแปร | ค่า |
|---|---|
| `RESEND_API_KEY` | API key จาก Resend |
| `EMAIL_FROM` | ผู้ส่ง เช่น `TOPJ_GRIND <updates@topjgrind.com>` (ต้องเป็นโดเมนที่ verify แล้ว) |
| `EMAIL_UNSUBSCRIBE_SECRET` | สตริงสุ่มยาวๆ ใช้เซ็นลิงก์ยกเลิก (เปลี่ยนค่าแล้วลิงก์ในอีเมลที่ส่งไปแล้วจะใช้ไม่ได้) |

4. รัน migration `0015_email_broadcasts.sql` (`npm run db:migrate`) — เพิ่มคอลัมน์ `email_updates`, ตาราง `email_broadcasts`, ฟังก์ชัน `email_recipients()` / `email_recipient_counts()`

ถ้ายังไม่ตั้ง env ปุ่มส่งจะแสดง "ระบบอีเมลยังไม่ได้ตั้งค่า" และกดส่งไม่ได้ · การส่งหนึ่งครั้งใช้เวลาไม่เกินราว 1 นาที (Resend รับ 2 คำขอ/วินาที, 100 ฉบับ/คำขอ) เกินเวลา ระบบหยุดแล้วบันทึกว่าส่งไม่ครบ — ฐานผู้รับระดับหลายพันคนควรย้ายไปส่งเป็นงานเบื้องหลัง

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
