# สมัคร Supabase + Bunny (เฟส 2)

ทำตามทีละข้อ แล้วใส่ค่าที่ได้ลงไฟล์ `topjgrind/.env.local` (ไฟล์นี้อยู่แค่ในเครื่อง ไม่ถูกส่งขึ้น git)
**ห้ามวาง key ลงในแชต** — ใส่ในไฟล์อย่างเดียว แล้วบอกผมว่า "ใส่แล้ว"

ใช้เวลาราว 30–45 นาที · ทั้งสองเจ้ามีแพ็กเริ่มต้นฟรีหรือจ่ายตามใช้ ยังไม่ต้องผูกบัตรจนกว่าจะเปิดจริง (Bunny ขอเติมเงินขั้นต่ำเมื่อพ้นช่วงทดลอง)

---

## 1. Supabase (ฐานข้อมูล + ระบบล็อกอิน)

1. ไปที่ https://supabase.com → **Start your project** → ล็อกอินด้วย GitHub หรืออีเมล
2. **New project**
   - Name: `topjgrind`
   - Database Password: กด **Generate** แล้วเก็บไว้ในที่ปลอดภัย (password manager)
   - Region: **Southeast Asia (Singapore)** — ใกล้คนดูไทยที่สุด
   - Plan: Free ไปก่อน
3. รอสร้างเสร็จ (~2 นาที) → **Project Settings → API** คัดลอก 3 ค่า:

   | บนหน้าเว็บ | ใส่ใน `.env.local` |
   |---|---|
   | Project URL | `NEXT_PUBLIC_SUPABASE_URL=` |
   | `anon` `public` key | `NEXT_PUBLIC_SUPABASE_ANON_KEY=` |
   | `service_role` key (กด Reveal) | `SUPABASE_SERVICE_ROLE_KEY=` ⚠️ ลับที่สุด |

4. **Database → Extensions** → ค้น `pg_cron` → เปิด (Enable)
5. **Authentication → URL Configuration**
   - Site URL: `http://localhost:3000` (ตอนเปิดจริงเปลี่ยนเป็น `https://topjgrind.com`)
   - Redirect URLs: เพิ่ม `http://localhost:3000/**`
6. ไฟล์ SQL **ยังไม่ต้องรัน** — ผมจะรันและทดสอบให้ตอนย้ายข้อมูล

## 2. Bunny Stream (วิดีโอ + Grind)

1. ไปที่ https://bunny.net → **Sign up** (มีช่วงทดลองฟรี)
2. เมนูซ้าย **Stream → Add Video Library**
   - Name: `topjgrind`
   - Replication regions: เลือก **Asia (Singapore)** อย่างน้อย 1 ที่
3. เข้า library ที่สร้าง → แท็บ **API** คัดลอก:

   | บนหน้าเว็บ | ใส่ใน `.env.local` |
   |---|---|
   | Video Library ID | `BUNNY_STREAM_LIBRARY_ID=` |
   | API Key | `BUNNY_STREAM_API_KEY=` ⚠️ ลับ |
   | CDN Hostname (เช่น `vz-xxxx.b-cdn.net`) | `BUNNY_STREAM_CDN_HOST=` |

4. แท็บ **Security**
   - เปิด **Enable token authentication** → คัดลอก key → `BUNNY_STREAM_TOKEN_KEY=` ⚠️ ลับ
   - **Allowed referrers**: ใส่ `localhost` และ `topjgrind.com`
   - ปิด **Direct play** (กันคนเอาลิงก์ไปเล่นที่อื่น)
5. แท็บ **Webhook** → ยังไม่ต้องใส่ (ต้องมีเว็บออนไลน์ก่อน ผมจะบอกตอน deploy)

## 3. Bunny Storage (ไฟล์เสียงพอดแคสต์)

1. เมนู **Storage → Add Storage Zone**
   - Name: `topjgrind-audio` · Main region: **Singapore**
2. เมนู **CDN → Add Pull Zone** → Origin type: **Storage Zone** → เลือก `topjgrind-audio`
   - Hostname ที่ได้ (เช่น `topjgrind-audio.b-cdn.net`) → `BUNNY_AUDIO_CDN_HOST=`
3. ใน Pull Zone นั้น → **Security → Token Authentication** → เปิด → คัดลอก key → `BUNNY_AUDIO_TOKEN_KEY=` ⚠️ ลับ

> หมายเหตุ: Bunny Storage อัปโหลดตรงจาก browser แบบต่อเนื่องเมื่อเน็ตหลุดไม่ได้ (ไม่มี TUS) — ผมจะเสนอทางแก้ตอนทำส่วนนี้

## 4. ตัวอย่าง `.env.local` เมื่อครบ

```
NEXT_PUBLIC_DEMO_MODE=true
NEXT_PUBLIC_SITE_URL=http://localhost:3000
PAYMENT_WEBHOOK_SECRET=demo-webhook-secret
# ราคาแพ็กเกจกำหนดตายตัวใน src/lib/plans.ts (990 บาท/เดือน, 4,990 บาท/ปี) ไม่ต้องตั้งใน env

NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

BUNNY_STREAM_LIBRARY_ID=123456
BUNNY_STREAM_API_KEY=xxxx
BUNNY_STREAM_CDN_HOST=vz-xxxx.b-cdn.net
BUNNY_STREAM_TOKEN_KEY=xxxx

BUNNY_AUDIO_CDN_HOST=topjgrind-audio.b-cdn.net
BUNNY_AUDIO_TOKEN_KEY=xxxx
```

ใส่เสร็จแล้วบอกผมว่า **"ใส่ key แล้ว"** ผมจะตรวจว่าเชื่อมต่อได้ (โดยไม่เปิดดูค่า key) แล้วเริ่มย้ายข้อมูล
