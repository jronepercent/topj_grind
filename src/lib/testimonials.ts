/**
 * Student results shown on /membership ("ผลลัพธ์จากคนที่เรียนกับ JR").
 * They come from JR's OMB course students (moved over from jronepercent.com/testimonial),
 * not from TOPJ_GRIND members, so the section says so and carries a results disclaimer.
 *
 * Files live in the public `thumbnails` bucket under `testimonials/` (never in the repo, never base64).
 * Videos: 1280×720 H.264 MP4 with faststart, posters 1280×720 JPG. Proofs: 1080×1350 WebP DM screenshots.
 */

const BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/thumbnails/testimonials`;

export type VideoTestimonial = {
  id: string;
  name: string;
  role: string;
  headline: string;
  result: string;
  story: string;
  video: string;
  poster: string;
};

export type ProofTestimonial = { id: string; tag: string; quote: string; who: string; image: string };

const video = (id: string, v: Omit<VideoTestimonial, "id" | "video" | "poster">): VideoTestimonial => ({
  id,
  ...v,
  video: `${BASE}/${id}.mp4`,
  poster: `${BASE}/${id}.jpg`,
});

export const VIDEO_TESTIMONIALS: VideoTestimonial[] = [
  video("ngoon", {
    name: "พี่องุ่น",
    role: "Creator · ผู้ติดตามรวม 1.4M+",
    headline: "เปิดขายวันแรก 100,000฿ จบเดือนแรก 1,200,000฿",
    result: "เดือนแรก 1.2 ล้านบาท",
    story: "สร้างช่องใหม่ขาย Digital Product สาย Affiliate เปิดสอนครั้งแรกได้ 100,000฿ ในวันเดียว",
  }),
  video("dream", {
    name: "น้องดรีม",
    role: "ครีเอเตอร์สอนตัดต่อมือถือ",
    headline: "เปิดคอร์สครั้งแรก ทำ 10,000฿ ใน 1 สัปดาห์",
    result: "คอร์สแรก 10,000฿ / 1 สัปดาห์",
    story: "สร้างคอร์สสอนตัดต่อในมือถือ ตั้งแต่เปิดตัวครั้งแรก ปัจจุบันยอดรวมหลายหมื่นแล้ว",
  }),
  video("aong", {
    name: "น้อง Aongpreneur",
    role: "Content Creator · ยอดวิวหลักแสน",
    headline: "ลงคลิปเดียว เห็นผลใน 2 วัน เงินก้อนแรก 20K",
    result: "20,000฿ จาก 1 คลิป",
    story: "ทำคอนเทนต์ยอดวิวหลักแสนแต่ขายไม่เคยได้ จนได้ 20K แรกจากคลิปเดียวที่ทำตามเทคนิคที่เรียน",
  }),
  video("kham", {
    name: "พี่ขาม (คุณหมอ)",
    role: "แพทย์ · สาย Expert ความรู้",
    headline: "วางระบบขายคอร์สอัตโนมัติ 24 ชม. โดยไม่กระทบงานหลัก",
    result: "ระบบขายอัตโนมัติ 24/7",
    story: "คุณหมอที่ขยายธุรกิจมาออนไลน์ ทำคอร์ส Premium พร้อมระบบหลังบ้านที่ขายได้โดยไม่ต้องเฝ้าจอ",
  }),
];

const proof = (n: number, tag: string, quote: string, who: string): ProofTestimonial => {
  const id = `proof-${String(n).padStart(2, "0")}`;
  return { id, tag, quote, who, image: `${BASE}/${id}.webp` };
};

/** Quotes are word for word from the screenshots (same text as the old site); don't polish them. */
export const PROOF_TESTIMONIALS: ProofTestimonial[] = [
  proof(1, "Stripe Dashboard", "4 วันของเดือนนี้ผมหาได้ 100K", "Digital Product"),
  proof(2, "30 วัน · 138K", "JR แม่งของจริงงง 🔥 ผลจากการเอาไปทำ", "Solopreneur"),
  proof(3, "1M to month", "โครตรวย พลังงานคนรวยเต็มแม็ก ผมกำลังตามไป 1M to month", "Creator"),
  proof(4, "Stripe Payments", "ขายได้จริง Succeeded ทุก order", "E-book"),
  proof(5, "One Man Business", "พอได้เรียน ONE MAN BUSINESS แบบครบทุกโมดูล มันทำให้ผมเข้าใจชัดเลย", "Digital Product"),
  proof(6, "AI Prompt", "แม่งโคตรคุ้ม ข้างในมีทุกอย่างให้แล้ว ไม่เสียใจที่ซื้อคอร์สกับเจอาร์", "Pet niche"),
  proof(7, "First order", "ขายได้แล้ว 1 ออเดอร์ค่ะ จากคนในคลาส เดือนนี้จะทำขายจริงเลย", "E-book + Consult"),
  proof(8, "Testimonial", "คลาสนี้ตอบโจทย์ เนื้อหาครอบคลุมตั้งแต่หาตัวตนไปจนถึงระบบออโต้", "Long-term follower"),
  proof(9, "Mindset shift", "รู้ว่าควรขายอะไร สื่อสารยังไง และวางระบบยังไงให้คนสนใจเข้ามาเอง", "Content creator"),
  proof(10, "New direction", "รู้สึกได้เนื้อเน้นๆ เห็นทิศทางการสร้างสินค้าอย่างชัดเจน", "Educator"),
];
