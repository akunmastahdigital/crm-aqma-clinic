import { NextResponse } from "next/server";
import { updateMessageStatus } from "@/lib/msgstatus";

export const dynamic = "force-dynamic";

// Dipanggil worker WA-QR saat status pesan keluar berubah (delivered/read).
export async function POST(req: Request) {
  if (req.headers.get("x-internal-secret") !== process.env.INTERNAL_SECRET)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  if (!b.externalId || !b.status)
    return NextResponse.json({ error: "data kurang" }, { status: 400 });
  await updateMessageStatus(b.externalId.toString(), b.status.toString());
  return NextResponse.json({ ok: true });
}
