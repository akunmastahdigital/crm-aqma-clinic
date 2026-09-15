import { NextResponse } from "next/server";
import { ingestIncoming } from "@/lib/inbox";
import { prisma } from "@/lib/db";
import { downloadWabaMedia } from "@/lib/waba";
import { saveMedia, mediaTypeFromMime } from "@/lib/storage";
import { updateMessageStatus } from "@/lib/msgstatus";

// Webhook WhatsApp Cloud API (Meta).
// GET  = verifikasi webhook (hub.challenge) saat "Verify and save" di Meta.
// POST = terima pesan masuk -> masuk inbox + jalankan automasi/AI.

export const dynamic = "force-dynamic";

type MediaObj = { id: string; caption?: string; filename?: string; mime_type?: string; voice?: boolean };
type WaMessage = {
  from: string;
  id: string;
  type: string;
  text?: { body?: string };
  image?: MediaObj;
  document?: MediaObj;
  video?: MediaObj;
  audio?: MediaObj;
  voice?: MediaObj;
  sticker?: MediaObj;
  reaction?: { message_id?: string; emoji?: string };
  button?: { payload?: string; text?: string };
  interactive?: {
    type?: string;
    button_reply?: { id?: string; title?: string };
    list_reply?: { id?: string; title?: string; description?: string };
  };
  context?: { id?: string };
  referral?: { source_type?: string; source_id?: string; ctwa_clid?: string; source_url?: string; headline?: string; body?: string; media_type?: string; image_url?: string; thumbnail_url?: string };
};
type WaStatus = { id: string; status: "sent" | "delivered" | "read" | "failed"; errors?: Array<{ code: number; title: string; message?: string }> };

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const mode = sp.get("hub.mode");
  const token = sp.get("hub.verify_token");
  const challenge = sp.get("hub.challenge");
  const VERIFY = process.env.WHATSAPP_VERIFY_TOKEN;

  if (mode === "subscribe" && VERIFY && token === VERIFY) {
    return new Response(challenge ?? "", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }
  return new Response("Forbidden", { status: 403 });
}

// Tipe media dari payload (tanpa unduh) — buat kirim notif duluan.
function mediaTypeOf(m: WaMessage): "image" | "video" | "audio" | "document" | null {
  if (m.image || m.sticker) return "image";
  if (m.video) return "video";
  if (m.audio || m.voice) return "audio";
  if (m.document) return "document";
  return null;
}

// Unduh media masuk (kalau ada) dan simpan lokal -> {url,type}
async function pullMedia(m: WaMessage, phoneNumberId?: string) {
  const obj: MediaObj | undefined =
    m.image || m.video || m.audio || m.voice || m.document || m.sticker;
  if (!obj?.id || !phoneNumberId) return null;
  const ch = await prisma.wabaChannel.findUnique({ where: { phoneNumberId } });
  if (!ch) return null;
  const dl = await downloadWabaMedia(obj.id, ch.accessToken);
  if (!dl) return null;
  const name = obj.filename || `${m.type}-${obj.id}`;
  const saved = await saveMedia(dl.buffer, name, dl.mime || obj.mime_type || "application/octet-stream");
  return { url: saved.url, type: mediaTypeFromMime(dl.mime || obj.mime_type || "") };
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ received: true });

  try {
    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value ?? {};
        const phoneNumberId: string | undefined = value.metadata?.phone_number_id;
        const contactName: string | undefined = value.contacts?.[0]?.profile?.name;
        // update ceklis (sent/delivered/read/failed) untuk pesan keluar kita
        for (const st of (value.statuses ?? []) as WaStatus[]) {
          await updateMessageStatus(st.id, st.status);
          if (st.status === "failed" && st.errors?.length) {
            console.error(`[WABA FAILED] wamid=${st.id} errors=${JSON.stringify(st.errors)}`);
          }
        }
        for (const m of (value.messages ?? []) as WaMessage[]) {
          let text = "";
          if (m.type === "text") text = m.text?.body ?? "";
          else if (m.type === "reaction") text = m.reaction?.emoji ? `[Reaksi: ${m.reaction.emoji}]` : "[reaction]";
          else if (m.type === "button") text = m.button?.text ?? "[button]";
          else if (m.type === "interactive") {
            const ir = m.interactive;
            if (ir?.type === "button_reply") text = ir.button_reply?.title ?? "[button]";
            else if (ir?.type === "list_reply") text = ir.list_reply?.title ?? "[list]";
            else text = "[interactive]";
          }
          else if (m.image?.caption) text = m.image.caption;
          else if (m.document?.caption) text = m.document.caption;
          else if (m.video?.caption) text = m.video.caption;

          const mediaType = mediaTypeOf(m);
          // tipe non-teks tanpa media (lokasi/kontak/dll) -> tetap ada penanda
          if (!text && !mediaType) text = `[${m.type}]`;

          // Notif dikirim SEKARANG (di dalam ingest), tanpa nunggu unduh media.
          const ingest = await ingestIncoming({
            channel: "WA_CLOUD",
            channelAccountId: phoneNumberId ?? null,
            from: m.from,
            name: contactName,
            text,
            externalId: m.id,
            mediaUrl: null,
            mediaType,
            replyToExternalId: m.context?.id ?? null,
            referral: m.referral ?? null,
          });

          // Unduh media di belakang, lalu tempelkan ke pesan (via externalId).
          if (mediaType && phoneNumberId) {
            const media = await pullMedia(m, phoneNumberId);
            if (media?.url)
              await prisma.message.updateMany({
                where: { externalId: m.id },
                data: { mediaUrl: media.url },
              });
          }
        }
      }
    }
  } catch (e) {
    console.error("webhook POST error:", e);
  }

  return NextResponse.json({ received: true });
}
