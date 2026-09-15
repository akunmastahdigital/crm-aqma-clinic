import { NextResponse } from "next/server";
import { ingestIncoming } from "@/lib/inbox";

export const dynamic = "force-dynamic";

// Dipanggil worker WA-QR (localhost) saat ada pesan masuk.
export async function POST(req: Request) {
  if (req.headers.get("x-internal-secret") !== process.env.INTERNAL_SECRET)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  // boleh teks kosong asal ada media
  if (!b.from || (!b.text && !b.mediaUrl))
    return NextResponse.json({ error: "data kurang" }, { status: 400 });
  await ingestIncoming({
    channel: "WA_QR",
    channelAccountId: b.channelId ?? null,
    from: b.from.toString(),
    name: b.name ?? undefined,
    text: (b.text ?? "").toString(),
    externalId: b.externalId?.toString(),
    mediaUrl: b.mediaUrl ?? null,
    mediaType: b.mediaType ?? null,
    replyToExternalId: b.replyToExternalId ?? null,
  });
  return NextResponse.json({ ok: true });
}
