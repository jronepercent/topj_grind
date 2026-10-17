# Deploy TOPJ_GRIND ขึ้น Vercel + topjgrind.com

โค้ดอยู่บน GitHub แล้ว: `jronepercent/topj_grind` · Production deploy จาก branch `master`
ทำทีละข้อตามลำดับ **ห้ามวาง key ลงแชต**

## 1. Import โปรเจกต์เข้า Vercel
1. https://vercel.com → ล็อกอินด้วย GitHub → **Add New → Project**
2. เลือก repo `jronepercent/topj_grind` → **Import**
3. Framework: Next.js (ตรวจเจออัตโนมัติ) · Root Directory: เว้นว่าง
4. **ยังไม่กด Deploy** ไปข้อ 2 ก่อน

## 2. ใส่ Environment Variables
1. ในหน้า Import เปิดส่วน **Environment Variables**
2. ลากไฟล์ `topjgrind/.env.vercel` ใส่ลงไปทั้งไฟล์ (มีค่าครบแล้ว)
3. ตรวจ 3 ค่านี้:
   - `NEXT_PUBLIC_DEMO_MODE` = `false`
   - `NEXT_PUBLIC_SITE_URL` = `https://topjgrind.com`
   - `PAYMENT_URL` ยังว่าง → ใส่ลิงก์ชำระเงินจริงเมื่อมี (ถ้ายังว่าง คนสมัครสมาชิกจ่ายเงินไม่ได้)
4. กด **Deploy** รอ 2–3 นาที จะได้ลิงก์ `xxx.vercel.app`
5. เสร็จแล้ว **ลบไฟล์ `.env.vercel` ทิ้ง** (มี secret production)

## 3. ผูกโดเมน topjgrind.com
1. Vercel → Project → **Settings → Domains → Add** → `topjgrind.com` (และ `www.topjgrind.com` เลือก redirect ไปโดเมนหลัก)
2. Vercel จะบอกค่า DNS ที่ต้องตั้ง (ปกติ A record `76.76.21.21` และ CNAME `www` → `cname.vercel-dns.com` ใช้ค่าที่ Vercel แสดงเป็นหลัก)
3. ไปที่ผู้ให้บริการโดเมน → DNS → ลบ record เดิมของหน้าพักโดเมน แล้วใส่ตามที่ Vercel บอก
4. รอ 5–60 นาที จนสถานะใน Vercel เป็น **Valid Configuration** (HTTPS ออกให้อัตโนมัติ)

## 4. Supabase — ทำให้ลิงก์ยืนยันอีเมลเปิดได้จากมือถือ
Supabase Dashboard → **Authentication → URL Configuration**
- **Site URL**: `https://topjgrind.com`
- **Redirect URLs** เพิ่ม:
  - `https://topjgrind.com/**`
  - `https://*.vercel.app/**` (เฉพาะช่วงทดสอบ ลบทีหลังได้)
  - `http://localhost:3000/**` (ไว้พัฒนาในเครื่อง)

> ลิงก์ยืนยันอีเมลหมดอายุใน 1 ชั่วโมงและใช้ได้ครั้งเดียว ถ้าหมดอายุให้สมัครใหม่หรือขอลิงก์ใหม่

## 5. Bunny — ตั้ง Webhook
Bunny → Stream → library `topjgrind` → **Webhook** ใส่:
`https://topjgrind.com/api/webhooks/bunny?secret=<ค่า BUNNY_WEBHOOK_SECRET>`
และใน **Security → Allowed referrers** ให้มี `topjgrind.com`

## 6. ตรวจหลังขึ้นจริง (ใช้มือถือ ต่อเน็ตมือถือ ไม่ใช่ Wi-Fi บ้าน)
- [ ] เปิด `https://topjgrind.com` เห็นหน้าแรก ไม่มีปุ่ม DEMO มุมซ้ายล่าง
- [ ] สมัครด้วยอีเมลใหม่ → เปิดลิงก์ในเมล → เข้าสู่ระบบสำเร็จ
- [ ] ล็อกอินเป็นแอดมิน → `/studio` เข้าได้ → อัปโหลดรูปปกใหญ่กว่า 2MB ได้
- [ ] อัปโหลดคลิปทดลอง → สถานะเป็น "พร้อมใช้งาน" (แปลว่า webhook Bunny ทำงาน)
- [ ] หน้าแรกโหลดไม่เกิน 2–3 วินาที

## ทำไมไม่ต้องตั้ง cron บน Vercel
ตั้งเวลาเผยแพร่/แจ้งเตือนหมดอายุรันด้วย `pg_cron` ในฐานข้อมูล Supabase อยู่แล้ว
(ตรวจว่าเปิด extension `pg_cron` ที่ Database → Extensions)
