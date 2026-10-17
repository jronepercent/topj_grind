// Sample content for `npm run db:seed`. Plain data only — the seed script maps these
// placeholder ids (v01, u-member, …) to real uuids when it inserts them into Supabase.
import type { CommentRow, ContentRow, ContentType, Payment, Profile, Subscription, View, Visibility } from "../src/lib/types.ts";

/** Same emails as src/lib/server/demo-accounts.ts (that file is server-only, so it can't be imported here). */
export const DEMO_ACCOUNTS = {
  admin: "admin@topjgrind.test",
  member: "member@topjgrind.test",
  expiring: "soon@topjgrind.test",
  free: "free@topjgrind.test",
} as const;

// Public demo streams (verified reachable). Real deployment uses Bunny Stream.
const LONG_SRC = [
  "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
  "https://files.vidstack.io/sprite-fight/720p.mp4",
  "https://test-streams.mux.dev/tos_ismc/main.m3u8",
  "https://files.vidstack.io/agent-327/720p.mp4",
  "https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8",
  "https://storage.googleapis.com/shaka-demo-assets/angel-one-hls/hls.m3u8",
  "https://files.vidstack.io/sprite-fight/720p.mp4",
  "https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_fmp4/master.m3u8",
];
const LONG_DUR = [634, 629, 734, 233, 734, 60, 629, 1800];
const SHORT_SRC = [
  "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
  "https://files.vidstack.io/agent-327/720p.mp4",
];
const PODCAST_SRC = (i: number) => `https://www.soundhelix.com/examples/mp3/SoundHelix-Song-${i}.mp3`;

const pic = (seed: string, w: number, h: number) => `https://picsum.photos/seed/${seed}/${w}/${h}`;

const DAY = 86_400_000;

function desc(intro: string, chapters: [string, string][] | null, tags: string[]) {
  const lines = [intro, ""];
  lines.push("📥 ดาวน์โหลด Template ฟรี: https://topjgrind.com/templates");
  lines.push("💬 คุยกับ JR ทาง LINE OA: https://lin.ee/topjgrind");
  if (chapters) {
    lines.push("", "Chapters");
    for (const [t, title] of chapters) lines.push(`${t} ${title}`);
  }
  lines.push("", tags.map((t) => `#${t}`).join(" "));
  return lines.join("\n");
}

export function buildSeed() {
  const now = Date.now();
  const iso = (offsetMs: number) => new Date(now + offsetMs).toISOString();

  // ───────── Users ─────────
  const mkProfile = (id: string, email: string, name: string, role: Profile["role"], avatarSeed?: string): Profile => ({
    id,
    email,
    display_name: name,
    avatar_url: avatarSeed ? pic(avatarSeed, 160, 160) : null,
    role,
    is_banned: false,
    autoplay: true,
    theme: "dark",
    save_history: true,
    created_at: iso(-120 * DAY),
  });

  const profiles: Profile[] = [
    mkProfile("u-admin", DEMO_ACCOUNTS.admin, "JR", "admin", "topj-jr"),
    mkProfile("u-member", DEMO_ACCOUNTS.member, "มายด์ สมาชิกตัวอย่าง", "user", "tg-member"),
    mkProfile("u-expiring", DEMO_ACCOUNTS.expiring, "บอส ใกล้หมดอายุ", "user"),
    mkProfile("u-free", DEMO_ACCOUNTS.free, "ฟรี ยังไม่สมัคร", "user"),
  ];
  const extraNames = [
    "ปุ้ย ณัฐชา", "ต้น ธนกร", "แพรว พิมพ์ชนก", "เจมส์ วรากร", "ฝน กมลชนก",
    "อาร์ม ศุภชัย", "นิว ปวีณา", "เบียร์ อนุชา", "มิ้นท์ ชุติมา", "โอ๊ต ภาณุ",
  ];
  extraNames.forEach((n, i) => profiles.push(mkProfile(`u-${i + 1}`, `user${i + 1}@topjgrind.test`, n, "user", i % 3 === 0 ? `tg-u${i}` : undefined)));


  const subscriptions: Subscription[] = [];
  const payments: Payment[] = [];
  const sub = (user_id: string, expiresOffsetDays: number | null, firstPaidDaysAgo: number) => {
    subscriptions.push({
      user_id,
      expires_at: expiresOffsetDays === null ? null : iso(expiresOffsetDays * DAY),
      first_paid_at: expiresOffsetDays === null ? null : iso(-firstPaidDaysAgo * DAY),
      updated_at: iso(-1 * DAY),
    });
    if (expiresOffsetDays === null) return;
    const months = Math.max(1, Math.round(firstPaidDaysAgo / 30));
    const methods: Payment["method"][] = ["promptpay", "card", "slip", "apple_pay"];
    for (let m = 0; m < months; m++) {
      const paid = iso(-(firstPaidDaysAgo - m * 30) * DAY);
      payments.push({
        id: `pay-${user_id}-${m}`,
        user_id,
        amount: 300,
        currency: "THB",
        months: 1,
        method: methods[(m + user_id.length) % methods.length],
        reference: `SEED-${user_id}-${m}`,
        paid_at: paid,
        raw: {},
        created_at: paid,
      });
    }
  };
  sub("u-admin", 3650, 30);
  sub("u-member", 20, 70);
  sub("u-expiring", 2, 28);
  sub("u-free", null, 0);
  [15, 6, -4, 25, null, 1, 9, -20, 28, 5].forEach((d, i) => sub(`u-${i + 1}`, d, d === null ? 0 : 10 + i * 9));

  // ───────── Categories ─────────
  const categories = [
    { id: "cat-mindset", name: "Mindset", slug: "mindset", position: 0 },
    { id: "cat-product", name: "Digital Product", slug: "digital-product", position: 1 },
    { id: "cat-marketing", name: "การตลาด", slug: "marketing", position: 2 },
    { id: "cat-ai", name: "AI & เครื่องมือ", slug: "ai-tools", position: 3 },
  ];

  // ───────── Content ─────────
  const content: ContentRow[] = [];
  const add = (
    id: string,
    type: ContentType,
    title: string,
    visibility: Visibility,
    cat: string,
    daysAgo: number,
    opts: Partial<ContentRow> & { src: string; dur: number },
  ) => {
    const { src, dur, ...rest } = opts;
    const thumb =
      type === "short" ? pic(`tg-${id}`, 720, 1280) : type === "podcast" ? pic(`tg-${id}`, 800, 800) : pic(`tg-${id}`, 1280, 720);
    const seedNum = [...id].reduce((a, c) => a + c.charCodeAt(0), 0);
    content.push({
      id,
      type,
      title,
      description: "",
      thumbnail_url: thumb,
      preview_url: null,
      bunny_video_id: null,
      audio_path: null,
      demo_src: src,
      duration_sec: dur,
      width: type === "short" ? 1080 : type === "podcast" ? null : 1920,
      height: type === "short" ? 1920 : type === "podcast" ? null : 1080,
      visibility,
      status: "published",
      media_status: "ready",
      published_at: iso(-daysAgo * DAY - (seedNum % 20) * 3_600_000),
      scheduled_at: null,
      category_id: cat,
      tags: [],
      comments_enabled: true,
      linked_content_id: null,
      linked_start_sec: null,
      captions_vtt: null,
      view_count: (seedNum * 137) % 48_000 + 900,
      like_count: (seedNum * 31) % 2_400 + 40,
      comment_count: 0,
      deleted_at: null,
      created_at: iso(-daysAgo * DAY - DAY),
      updated_at: iso(-daysAgo * DAY),
      ...rest,
    });
  };

  const V: [string, string, Visibility, string, number, string, [string, string][] | null, string[]][] = [
    ["v01", "เริ่มขาย Digital Product ชิ้นแรกใน 30 วัน (ฉบับคนไม่มีฐานแฟน)", "members", "cat-product", 1,
      "แผน 30 วันแบบลงมือทำได้ทันที ตั้งแต่เลือกไอเดีย ทำ MVP ไปจนถึงปิดการขายชิ้นแรก ไม่ต้องมีผู้ติดตามเยอะก็เริ่มได้",
      [["0:00", "ทำไม 30 วันถึงพอ"], ["1:20", "สัปดาห์ที่ 1: เลือกปัญหาที่คนยอมจ่าย"], ["3:05", "สัปดาห์ที่ 2: ทำ MVP ให้เสร็จใน 3 วัน"], ["5:40", "สัปดาห์ที่ 3: พรีเซลล์"], ["8:10", "สัปดาห์ที่ 4: ปิดการขาย + เก็บรีวิว"]],
      ["digitalproduct", "เริ่มจาก0"]],
    ["v02", "ทำไมคนขยันส่วนใหญ่ยังไม่รวย — ระบบ 1% ต่อวัน", "public", "cat-mindset", 3,
      "ขยันอย่างเดียวไม่พอ ถ้าไม่มีระบบที่ทบต้น คลิปนี้คือวิธีคิดแบบ 1% ที่ JR ใช้มา 5 ปี",
      [["0:00", "เปิดเรื่อง"], ["2:00", "กับดักความขยัน"], ["4:30", "ระบบ 1% ต่อวันคืออะไร"], ["7:15", "วิธีวัดผลทุกสัปดาห์"], ["9:30", "สรุป"]],
      ["mindset", "grind", "1percent"]],
    ["v03", "หา Niche ที่ขายได้จริง: 3 คำถามที่ต้องตอบก่อนทำอะไร", "public", "cat-product", 6,
      "ก่อนทำคอร์ส ก่อนทำ eBook ตอบ 3 คำถามนี้ให้ได้ก่อน แล้วคุณจะไม่เสียเวลาทำของที่ไม่มีใครซื้อ",
      [["0:00", "ปัญหาของคนส่วนใหญ่"], ["1:45", "คำถามที่ 1: ใครเจ็บที่สุด"], ["4:10", "คำถามที่ 2: เขาจ่ายเงินแก้อยู่แล้วไหม"], ["6:50", "คำถามที่ 3: ทำไมต้องเป็นคุณ"]],
      ["niche", "digitalproduct"]],
    ["v04", "เขียนหน้าขายให้คนกดซื้อ ไม่ต้องเก่งภาษา", "members", "cat-marketing", 8,
      "โครงหน้าขาย 7 บล็อกที่ JR ใช้กับทุกสินค้า พร้อมตัวอย่างจริง ก๊อปไปปรับใช้ได้เลย",
      [["0:00", "หน้าขายที่ดีหน้าตาเป็นยังไง"], ["2:30", "Hook ด้านบน"], ["5:00", "ปัญหา → ทางออก"], ["8:20", "Social proof"], ["10:45", "ราคา + CTA"]],
      ["copywriting", "salespage"]],
    ["v05", "ใช้ AI ทำคอนเทนต์ 30 ชิ้นใน 1 วัน (Workflow จริงของ JR)", "members", "cat-ai", 10,
      "เปิด workflow ทั้งหมดตั้งแต่หาไอเดีย เขียนสคริปต์ ไปจนถึงตัดต่อ ด้วยเครื่องมือ AI ที่ใช้อยู่ทุกวัน",
      [["0:00", "ภาพรวม workflow"], ["1:30", "หาไอเดีย 30 หัวข้อใน 10 นาที"], ["4:00", "เขียนสคริปต์ด้วย AI"], ["7:30", "ตัดต่อแบบ batch"]],
      ["ai", "contentcreator"]],
    ["v06", "ตั้งราคาสินค้าดิจิทัลยังไงไม่ให้ขาดทุนเวลา", "public", "cat-product", 13,
      "ราคาถูกไม่ได้แปลว่าขายง่าย คลิปนี้อธิบายวิธีตั้งราคาจากคุณค่าที่ลูกค้าได้ ไม่ใช่จากเวลาที่คุณใช้",
      null, ["pricing", "digitalproduct"]],
    ["v07", "Routine 5 โมงเช้า: วันจริงของ JR", "public", "cat-mindset", 16,
      "ตามติด 1 วันเต็มของ JR ตั้งแต่ตื่นตี 5 จนปิดคอม ทำอะไรบ้าง ใช้เวลาไปกับอะไร",
      [["0:00", "05:00 ตื่น"], ["1:40", "Deep work ชั่วโมงแรก"], ["4:20", "ถ่ายคอนเทนต์"], ["7:10", "ตอบลูกค้า + ปิดวัน"]],
      ["routine", "grind"]],
    ["v08", "Funnel ง่ายที่สุดสำหรับคนเริ่มจาก 0", "members", "cat-marketing", 20,
      "ไม่ต้องมีระบบซับซ้อน แค่ 3 ขั้นนี้ก็ขายได้ทุกวัน: คอนเทนต์ฟรี → LINE OA → ข้อเสนอเดียว",
      [["0:00", "Funnel คืออะไร"], ["2:15", "ขั้นที่ 1: คอนเทนต์ฟรี"], ["4:45", "ขั้นที่ 2: LINE OA"], ["7:30", "ขั้นที่ 3: ข้อเสนอ"]],
      ["funnel", "marketing"]],
    ["v09", "รีวิวเครื่องมือที่ใช้ทุกวัน (Notion, Canva, ChatGPT, Claude)", "public", "cat-ai", 24,
      "เครื่องมือ 4 ตัวที่ทำให้ทีมคนเดียวทำงานได้เหมือนทีม 5 คน พร้อมวิธีใช้ที่คนส่วนใหญ่ไม่รู้",
      null, ["tools", "ai", "notion"]],
    ["v10", "เปิดตัวเลขจริง: เดือนแรกที่ขายคอร์สได้ 6 หลัก", "members", "cat-product", 31,
      "เปิดหลังบ้านทั้งหมด ยอดขาย ค่าแอด อัตราปิดการขาย และสิ่งที่จะทำต่างออกไปถ้าเริ่มใหม่",
      [["0:00", "ตัวเลขทั้งหมด"], ["2:40", "ช่องทางที่ขายได้ดีที่สุด"], ["5:30", "สิ่งที่พลาด"], ["8:00", "ถ้าเริ่มใหม่จะทำอะไร"]],
      ["casestudy", "digitalproduct"]],
    ["v11", "เลิกรอแรงบันดาลใจ: วินัยที่ไม่ต้องใช้ใจ", "public", "cat-mindset", 38,
      "แรงบันดาลใจมาแล้วก็ไป วินัยที่ออกแบบดีไม่ต้องพึ่งอารมณ์ นี่คือ 4 กฎที่ JR ใช้",
      null, ["discipline", "mindset"]],
    ["v12", "Live Q&A: ตอบทุกคำถามเรื่อง Digital Product", "members", "cat-product", 45,
      "รวมคำถามจากสมาชิกกว่า 50 ข้อ ตอบครบทุกเรื่อง ตั้งแต่เริ่มต้นจนถึงขยายยอดขาย",
      [["0:00", "เริ่มไลฟ์"], ["3:00", "คำถามเรื่องการเริ่มต้น"], ["15:00", "คำถามเรื่องการตลาด"], ["30:00", "คำถามเรื่องการขยาย"]],
      ["qa", "live"]],
  ];
  V.forEach(([id, title, vis, cat, days, intro, ch, tags], i) =>
    add(id, "video", title, vis, cat, days, {
      src: LONG_SRC[i % LONG_SRC.length],
      dur: LONG_DUR[i % LONG_DUR.length],
      description: desc(intro, ch, tags),
      tags,
    }),
  );

  const S: [string, string, Visibility, string, number][] = [
    ["s01", "คนขยันที่ไม่รวย ขาดสิ่งนี้", "public", "cat-mindset", 2],
    ["s02", "ไอเดียสินค้าดิจิทัลที่ขายได้ภายใน 7 วัน", "members", "cat-product", 4],
    ["s03", "หยุดทำคอนเทนต์ที่ไม่มีใครถาม", "public", "cat-marketing", 5],
    ["s04", "Prompt เดียวที่ใช้ทุกวัน", "members", "cat-ai", 9],
    ["s05", "ตี 5 ไม่ได้ทำให้รวย แต่สิ่งนี้ทำได้", "public", "cat-mindset", 12],
    ["s06", "ตั้งราคา 99 บาท = ฆ่าตัวเอง", "public", "cat-product", 15],
    ["s07", "หน้าขายที่ปิดได้ 12%", "members", "cat-marketing", 19],
    ["s08", "1% ต่อวัน = 37 เท่าต่อปี", "public", "cat-mindset", 22],
  ];
  S.forEach(([id, title, vis, cat, days], i) =>
    add(id, "short", title, vis, cat, days, {
      src: SHORT_SRC[i % SHORT_SRC.length],
      dur: i % 2 ? 233 : 6,
      description: `${title} — สรุปสั้นๆ ใน 60 วินาที ดูคลิปเต็มได้ในช่อง\n\n#shorts #topjgrind`,
      tags: ["shorts"],
      ...(id === "s01" ? { linked_content_id: "v02", linked_start_sec: 120 } : {}),
      ...(id === "s03" ? { linked_content_id: "v08", linked_start_sec: 135 } : {}),
    }),
  );

  const P: [string, string, Visibility, number, string][] = [
    ["p01", "GRIND TALK EP.5 — ทำงานคนเดียวยังไงไม่ให้หมดไฟ", "public", 2, "คุยยาวเรื่องการจัดการพลังงาน ไม่ใช่การจัดการเวลา"],
    ["p02", "GRIND TALK EP.4 — จากพนักงานประจำสู่รายได้ออนไลน์", "members", 9, "เรื่องจริงของการลาออก แผนสำรอง และตัวเลขเดือนแรก"],
    ["p03", "GRIND TALK EP.3 — เงินก้อนแรกควรเอาไปทำอะไร", "members", 17, "ลงทุนกับตัวเอง ลงแอด หรือเก็บไว้ คำตอบอาจไม่ใช่อย่างที่คิด"],
    ["p04", "GRIND TALK EP.2 — ความกลัวการขายของ", "public", 27, "ทำไมคนเก่งหลายคนขายไม่ได้ และวิธีเปลี่ยนมุมคิดเรื่องการขาย"],
    ["p05", "GRIND TALK EP.1 — ทำไมต้อง 1%", "public", 40, "ตอนแรกของพอดแคสต์ เล่าที่มาของ TOPJ_GRIND"],
  ];
  P.forEach(([id, title, vis, days, intro], i) =>
    add(id, "podcast", title, vis, i % 2 ? "cat-product" : "cat-mindset", days, {
      src: PODCAST_SRC(i + 1),
      dur: [372, 425, 344, 302, 352][i],
      description: desc(intro, [["0:00", "เปิดรายการ"], ["1:30", "ประเด็นหลัก"], ["4:00", "คำถามจากผู้ฟัง"], ["5:30", "ปิดท้าย"]], ["podcast", "grindtalk"]),
      tags: ["podcast", "grindtalk"],
    }),
  );

  // Studio examples: a draft and a scheduled clip (still processing)
  add("v13", "video", "(ร่าง) 10 ข้อผิดพลาดของคนเพิ่งเริ่มขายของออนไลน์", "public", "cat-product", 0, {
    src: LONG_SRC[1], dur: 653, status: "draft", published_at: null,
    description: desc("กำลังตัดต่อ", null, ["mistakes"]), tags: ["mistakes"],
  });
  add("v14", "video", "Workshop: สร้าง Lead Magnet ใน 1 ชั่วโมง", "members", "cat-marketing", 0, {
    src: LONG_SRC[2], dur: 888, status: "scheduled", media_status: "processing", published_at: null,
    scheduled_at: iso(1 * DAY + 3 * 3_600_000),
    description: desc("Workshop สด ทำตามไปพร้อมกัน", null, ["leadmagnet"]), tags: ["leadmagnet"],
  });

  const content_links = content
    .filter((c) => c.type !== "short" && c.status === "published")
    .flatMap((c, i) => [
      { id: `lnk-${c.id}-1`, content_id: c.id, label: "📥 ดาวน์โหลด Template", url: "https://topjgrind.com/templates", position: 0 },
      { id: `lnk-${c.id}-2`, content_id: c.id, label: "LINE OA", url: "https://lin.ee/topjgrind", position: 1 },
      ...(i % 2 === 0
        ? [{ id: `lnk-${c.id}-3`, content_id: c.id, label: "สมัครคอร์ส", url: "https://topjgrind.com/membership", position: 2 }]
        : []),
    ]);

  const content_resources = ["v01", "v03", "v04", "v08", "p02"].flatMap((cid, i) => [
    { id: `res-${cid}-1`, content_id: cid, file_name: `Worksheet-${cid.toUpperCase()}.pdf`, storage_path: `resources/${cid}/worksheet.pdf`, size_bytes: 480_000 + i * 120_000, position: 0 },
    ...(i % 2 === 0
      ? [{ id: `res-${cid}-2`, content_id: cid, file_name: `Template-${cid.toUpperCase()}.zip`, storage_path: `resources/${cid}/template.zip`, size_bytes: 2_400_000, position: 1 }]
      : []),
  ]);

  // ───────── Playlists ─────────
  const playlists = [
    {
      id: "pl-course", title: "คอร์ส 0 → ขายชิ้นแรก", description: "ซีรีส์บทเรียนเรียงลำดับ ตั้งแต่หา niche จนปิดการขายชิ้นแรก ดูตามลำดับเพื่อผลลัพธ์ที่ดีที่สุด",
      thumbnail_url: pic("tg-pl-course", 1280, 720), visibility: "members" as Visibility, is_course: true, position: 0, created_at: iso(-50 * DAY),
    },
    {
      id: "pl-mindset", title: "Mindset รายวัน", description: "คลิปสั้น คลิปยาว และพอดแคสต์ สำหรับวันที่ไฟมอด",
      thumbnail_url: pic("tg-pl-mindset", 1280, 720), visibility: "public" as Visibility, is_course: false, position: 1, created_at: iso(-40 * DAY),
    },
  ];
  const playlist_items = [
    ...["v03", "v06", "v01", "s02", "v04", "v08", "p02", "v10"].map((cid, i) => ({ playlist_id: "pl-course", content_id: cid, position: i })),
    ...["v02", "s01", "v07", "p01", "v11", "s08"].map((cid, i) => ({ playlist_id: "pl-mindset", content_id: cid, position: i })),
  ];

  // ───────── Progress / likes / saved ─────────
  const watch_progress = [
    { user_id: "u-member", content_id: "v02", position_sec: 300, completed: false, updated_at: iso(-3_600_000) },
    { user_id: "u-member", content_id: "v03", position_sec: 0, completed: true, updated_at: iso(-DAY) },
    { user_id: "u-member", content_id: "v06", position_sec: 0, completed: true, updated_at: iso(-2 * DAY) },
    { user_id: "u-member", content_id: "v01", position_sec: 210, completed: false, updated_at: iso(-2 * 3_600_000) },
    { user_id: "u-member", content_id: "p01", position_sec: 150, completed: false, updated_at: iso(-5 * 3_600_000) },
  ];
  const likes = [{ user_id: "u-member", content_id: "v02", created_at: iso(-DAY) }];
  const saved = [
    { user_id: "u-member", content_id: "v05", created_at: iso(-DAY) },
    { user_id: "u-member", content_id: "p03", created_at: iso(-2 * DAY) },
  ];

  // ───────── Comments ─────────
  const comments: CommentRow[] = [];
  const cm = (id: string, content_id: string, user_id: string, body: string, hoursAgo: number, extra: Partial<CommentRow> = {}) =>
    comments.push({
      id, content_id, user_id, parent_id: null, body, like_count: 0, is_pinned: false, creator_hearted: false,
      is_hidden: false, edited_at: null, deleted_at: null, created_at: iso(-hoursAgo * 3_600_000), ...extra,
    });
  cm("c1", "v02", "u-admin", "ใครทำ 1% ครบ 30 วันแล้ว มาเล่าให้ฟังหน่อยครับ 🔥", 60, { is_pinned: true, like_count: 84 });
  cm("c2", "v02", "u-member", "ช่วง 4:30 เปลี่ยนชีวิตมาก ทำตามมา 2 สัปดาห์ งานเสร็จเร็วขึ้นจริง", 40, { like_count: 41, creator_hearted: true });
  cm("c3", "v02", "u-admin", "ดีใจด้วยครับ ทำต่อให้ครบ 90 วัน แล้วจะเห็นผลทบต้น", 38, { parent_id: "c2", like_count: 12 });
  cm("c4", "v02", "u-3", "ขอบคุณครับ อยากให้ทำคลิปเรื่องการวัดผลแบบละเอียดอีก", 30, { like_count: 9 });
  cm("c5", "v02", "u-6", "สรุปให้: 1) เริ่มเล็ก 2) วัดทุกสัปดาห์ 3) ห้ามหยุด", 20, { like_count: 22 });
  cm("c6", "v02", "u-member", "สรุปดีมากครับ", 18, { parent_id: "c5", like_count: 2 });
  cm("c7", "v01", "u-member", "ทำ MVP ตาม 3:05 เสร็จแล้ว ขายได้ 3 ชิ้นแรก!", 10, { like_count: 18, creator_hearted: true });
  cm("c8", "v01", "u-1", "อยากรู้ว่าถ้าไม่มีหน้าเว็บ ใช้ LINE OA แทนได้ไหมครับ", 6, { like_count: 4 });
  cm("c9", "s01", "u-2", "โดนมาก 😂", 12, { like_count: 7 });
  cm("c10", "p01", "u-4", "ฟังตอนวิ่งทุกเช้า ขอ EP ต่อไปเร็วๆ", 16, { like_count: 5 });
  for (const c of content) c.comment_count = comments.filter((x) => x.content_id === c.id).length;

  // ───────── Notifications ─────────
  const notifications = [
    { id: "n1", user_id: "u-member", type: "new_content" as const, title: "คลิปใหม่", body: content[0].title, link: "/watch/v01", image_url: content[0].thumbnail_url, read_at: null, created_at: iso(-DAY) },
    { id: "n2", user_id: "u-member", type: "heart" as const, title: "JR หัวใจความคิดเห็นของคุณ", body: "ช่วง 4:30 เปลี่ยนชีวิตมาก…", link: "/watch/v02#comments", image_url: null, read_at: null, created_at: iso(-30 * 3_600_000) },
    { id: "n3", user_id: "u-member", type: "reply" as const, title: "JR ตอบกลับความคิดเห็นของคุณ", body: "ดีใจด้วยครับ ทำต่อให้ครบ 90 วัน…", link: "/watch/v02#comments", image_url: null, read_at: iso(-DAY), created_at: iso(-38 * 3_600_000) },
    { id: "n4", user_id: "u-expiring", type: "expiring" as const, title: "สมาชิกใกล้หมดอายุ", body: "สมาชิกของคุณจะหมดอายุใน 2 วัน", link: "/membership", image_url: null, read_at: null, created_at: iso(-3_600_000) },
  ];

  // ───────── Home ─────────
  const home_sections = [
    { id: "hs-hero", type: "hero" as const, title: "Hero", content_ids: ["v01", "v05", "v02", "p01", "v10"], position: 0, enabled: true },
    { id: "hs-continue", type: "continue" as const, title: "ดูต่อจากที่ค้างไว้", content_ids: [], position: 1, enabled: true },
    { id: "hs-start", type: "custom" as const, title: "เริ่มต้นที่นี่", content_ids: ["v03", "v02", "v06", "v11"], position: 2, enabled: true },
    { id: "hs-latest", type: "latest" as const, title: "ใหม่ล่าสุด", content_ids: [], position: 3, enabled: true },
    { id: "hs-shorts", type: "shorts" as const, title: "Shorts", content_ids: [], position: 4, enabled: true },
    { id: "hs-podcasts", type: "podcasts" as const, title: "พอดแคสต์", content_ids: [], position: 5, enabled: true },
    { id: "hs-playlists", type: "playlists" as const, title: "Playlist และซีรีส์", content_ids: [], position: 6, enabled: true },
  ];

  // ~28 days of view history so Studio charts have shape
  const views: View[] = [];
  const live = content.filter((c) => c.status === "published");
  for (let day = 27; day >= 0; day--) {
    const n = 14 + ((day * 7) % 11) + (27 - day);
    for (let k = 0; k < n; k++) {
      const c = live[(day * 13 + k * 7) % live.length];
      const u = (day + k) % 5 === 0 ? null : profiles[(day + k) % profiles.length].id;
      views.push({
        id: `vw-${day}-${k}`,
        content_id: c.id,
        user_id: u,
        session_id: `seed-${day}-${k}`,
        watched_sec: Math.min(c.duration_sec, 30 + ((k * 97) % 600)),
        created_at: iso(-day * DAY - ((k * 3137) % DAY)),
      });
    }
  }

  return {
    profiles,
    subscriptions,
    payments,
    payment_errors: [],
    content,
    content_links,
    content_resources,
    categories,
    playlists,
    playlist_items,
    watch_progress,
    likes,
    saved,
    views,
    comments,
    comment_likes: [],
    comment_reports: [{ id: "rep1", comment_id: "c9", user_id: "u-5", reason: "สแปม", created_at: iso(-5 * 3_600_000) }],
    banned_words: [{ id: "bw1", word: "พนันออนไลน์" }, { id: "bw2", word: "สล็อต" }],
    notifications,
    home_sections,
    site_settings: {
      channel_name: "TOPJ_GRIND",
      tagline: "ทำทุกวัน 1% แล้วปล่อยให้ดอกเบี้ยทบต้นทำงาน",
      about:
        "สวัสดีครับ ผม JR\n\nช่องนี้คือที่รวมทุกอย่างที่ผมรู้เรื่องการสร้างรายได้จาก Digital Product ตั้งแต่ศูนย์ — mindset, การหา niche, การทำสินค้า, การตลาด และเครื่องมือ AI ที่ใช้จริงทุกวัน\n\nไม่มีทางลัด มีแต่ระบบที่ทำซ้ำได้ทุกวัน",
      avatar_url: pic("topj-jr", 320, 320),
      banner_url: pic("topj-banner", 2560, 640),
      socials: [
        { key: "tiktok", label: "TikTok", url: "https://www.tiktok.com/@topjgrind" },
        { key: "instagram", label: "Instagram", url: "https://www.instagram.com/topjgrind" },
        { key: "youtube", label: "YouTube", url: "https://www.youtube.com/@topjgrind" },
        { key: "facebook", label: "Facebook", url: "https://www.facebook.com/topjgrind" },
        { key: "threads", label: "Threads", url: "https://www.threads.net/@topjgrind" },
        { key: "line", label: "LINE OA", url: "https://lin.ee/topjgrind" },
      ],
      paywall_title: "คอนเทนต์นี้สำหรับสมาชิก TOPJ_GRIND",
      paywall_benefits: ["ดูได้ทุกคลิป ทั้งวิดีโอและ Shorts", "ฟังพอดแคสต์ทุกตอน", "ดาวน์โหลดไฟล์ประกอบและ Template", "คอมเมนต์คุยกับ JR ได้โดยตรง"],
      price_thb: Number(process.env.MEMBERSHIP_PRICE_THB ?? 300),
    },
    admin_audit_log: [],
  };
}
