import { NextResponse } from "next/server";
import { getViewer } from "@/lib/server/auth";
import { db } from "@/lib/server/store";
import { getContentRow, isLive } from "@/lib/server/queries";

export const dynamic = "force-dynamic";

/** Members-only download. Production: Supabase Storage private bucket → signed URL (10 minutes). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getViewer();
  const res = db().content_resources.find((r) => r.id === id);
  const c = res && getContentRow(res.content_id);
  if (!res || !c || (!isLive(c) && !viewer?.is_admin)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!viewer?.is_member) return NextResponse.json({ error: "members_only" }, { status: viewer ? 403 : 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) {
    const r = await fetch(`${url}/storage/v1/object/sign/resources/${res.storage_path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, apikey: key, "Content-Type": "application/json" },
      body: JSON.stringify({ expiresIn: 600 }),
    });
    if (r.ok) {
      const { signedURL } = (await r.json()) as { signedURL: string };
      return NextResponse.redirect(`${url}/storage/v1${signedURL}&download=${encodeURIComponent(res.file_name)}`);
    }
    return NextResponse.json({ error: "storage_error" }, { status: 502 });
  }

  // Demo mode: generate a tiny placeholder file
  const isPdf = res.file_name.toLowerCase().endsWith(".pdf");
  const body = isPdf ? demoPdf(`TOPJ_GRIND - ${res.file_name}`) : Buffer.from(`TOPJ_GRIND demo file: ${res.file_name}\n`);
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": isPdf ? "application/pdf" : "application/octet-stream",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(res.file_name)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

function demoPdf(text: string) {
  const safe = text.replace(/[()\\]/g, "").replace(/[^\x20-\x7e]/g, "?");
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    "",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  const stream = `BT /F1 20 Tf 72 760 Td (${safe}) Tj ET`;
  objs[3] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) out += `${String(off).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}
