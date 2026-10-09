import { NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { ingestIncoming } from "@/lib/inbox";
import { prisma } from "@/lib/db";
import { updateMessageStatus } from "@/lib/msgstatus";

export const dynamic = "force-dynamic";

const WAHA_URL = process.env.WAHA_URL || "http://127.0.0.1:3055";
const WAHA_API_KEY = process.env.WAHA_API_KEY || "";
const MEDIA_DIR = process.env.MEDIA_DIR || "/root/work/crm-aqma-clinic/uploads";
const MEDIA_BASE_URL = process.env.MEDIA_BASE_URL || "/uploads";

function mediaTypeFromMime(mime: string): string {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "document";
}

function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif",
    "video/mp4": ".mp4", "video/3gpp": ".3gp",
    "audio/ogg": ".ogg", "audio/mpeg": ".mp3", "audio/amr": ".amr",
    "application/pdf": ".pdf",
  };
  return map[mime.split(";")[0]] || "";
}

async function downloadWahaMedia(url: string, mime: string): Promise<string | null> {
  try {
    // WAHA mengirim URL internal (localhost:3000) — replace ke alamat aktual
    const actualUrl = url
      .replace(/^http:\/\/localhost:\d+/, WAHA_URL)
      .replace(/^http:\/\/127\.0\.0\.1:3000(\/|$)/, WAHA_URL + "/");
    const res = await fetch(actualUrl, {
      headers: { "X-Api-Key": WAHA_API_KEY },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const ext = extFromMime(mime);
    const rand = Math.random().toString(36).slice(2, 8);
    const filename = `${Date.now()}-${rand}${ext}`;
    await mkdir(MEDIA_DIR, { recursive: true });
    await writeFile(path.join(MEDIA_DIR, filename), buf);
    return `${MEDIA_BASE_URL}/${filename}`;
  } catch (e) {
    console.error("[waha-webhook] gagal download media:", e);
    return null;
  }
}

// POST /api/internal/waha-webhook — dipanggil WAHA saat ada pesan masuk
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    // ACK event — update status ceklis pesan keluar
    if (body.event === "message.ack") {
      const p = body.payload;
      const rawId = (p?.id ?? p?.key?.id ?? "") as string;
      // WAHA NOWEB bisa kirim ID penuh: "true_628...@c.us_3EB0..." atau pendek: "3EB0..."
      // DB menyimpan ID pendek (key.id dari sendText). Normalisasi ke format pendek.
      const wamid = rawId.includes("_") ? rawId.split("_").pop()! : rawId;
      const ack = p?.ack as number | undefined;
      if (wamid && ack !== undefined) {
        // WAHA ack: -1=FAILED, 1=SENT (abaikan), 2=DELIVERED, 3=READ, 4=PLAYED(≈READ)
        if (ack === -1) await updateMessageStatus(wamid, "failed");
        else if (ack === 2) await updateMessageStatus(wamid, "delivered");
        else if (ack >= 3) await updateMessageStatus(wamid, "read");
      }
      return NextResponse.json({ ok: true });
    }

    // Hanya proses event "message"
    if (body.event !== "message") return NextResponse.json({ ok: true });

    const p = body.payload;
    if (!p) return NextResponse.json({ ok: true });

    // Skip pesan yang dikirim dari kita (fromMe) atau pesan grup
    if (p.fromMe) return NextResponse.json({ ok: true });
    const fromJid: string = p.from || "";
    if (fromJid.endsWith("@g.us") || fromJid.endsWith("@broadcast")) return NextResponse.json({ ok: true });

    // Simpan JID asli (bisa @s.whatsapp.net atau @lid) untuk dipakai saat balas
    const waQrJid = fromJid;

    // Strip suffix untuk dapat nomor telepon saja
    let from = fromJid.replace(/@.*$/, "");
    if (!from || from.length < 5) return NextResponse.json({ ok: true });

    // Cari channelAccountId dari session name
    const sessionName = body.session as string | undefined;
    let channelAccountId: string | null = null;
    if (sessionName) {
      const ch = await prisma.waQrChannel.findFirst({
        where: { pm2Name: sessionName },
        select: { id: true },
      });
      channelAccountId = ch?.id ?? null;
    }

    // Jika dari LID (@lid), resolve ke nomor HP via WAHA store
    if (fromJid.endsWith("@lid") && sessionName) {
      try {
        const res = await fetch(`${WAHA_URL}/api/${sessionName}/lids/${from}`, {
          headers: { "X-Api-Key": WAHA_API_KEY },
          signal: AbortSignal.timeout(3000),
        });
        if (res.ok) {
          const data = await res.json() as { pn?: string };
          if (data.pn) from = data.pn.replace(/@.*$/, "");
        }
      } catch { /* store belum resolve, pakai LID sementara */ }
    }

    // Download media jika ada
    let mediaUrl: string | null = null;
    let mediaType: string | null = null;
    if (p.hasMedia && p.media?.url) {
      const mime = (p.media.mimetype || "application/octet-stream") as string;
      mediaUrl = await downloadWahaMedia(p.media.url, mime);
      if (mediaUrl) mediaType = mediaTypeFromMime(mime);
    }

    const text = (p.body || p.caption || "") as string;
    if (!text && !mediaUrl) return NextResponse.json({ ok: true });

    const name: string | undefined = p._data?.pushName || p._data?.notify || undefined;

    await ingestIncoming({
      channel: "WA_QR",
      channelAccountId,
      from,
      name,
      text,
      externalId: p.id?.toString(),
      mediaUrl,
      mediaType,
      replyToExternalId: (p.replyTo?.id as string | null) ?? null,
    });

    // Simpan JID asli ke conversation supaya delivery bisa pakai format yang benar (@lid vs @s.whatsapp.net)
    if (channelAccountId && waQrJid !== from) {
      try {
        const customer = await prisma.customer.findFirst({ where: { phone: from }, select: { id: true } });
        if (customer) {
          await prisma.conversation.updateMany({
            where: { customerId: customer.id, channelAccountId, channel: "WA_QR" },
            data: { waQrJid },
          });
        }
      } catch { /* non-critical */ }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[waha-webhook] error:", e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
