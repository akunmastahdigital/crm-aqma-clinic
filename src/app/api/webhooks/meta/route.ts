import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ingestIncoming } from "@/lib/inbox";
import { getMetaUserName } from "@/lib/meta-messaging";

export const dynamic = "force-dynamic";

// GET — verifikasi webhook Meta (IG + Messenger)
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const mode = sp.get("hub.mode");
  const token = sp.get("hub.verify_token");
  const challenge = sp.get("hub.challenge");

  const setting = await prisma.crmSetting.findUnique({ where: { key: "meta_webhook_verify_token" } });
  const stored = setting ? JSON.parse(setting.value) as string : null;

  if (mode === "subscribe" && stored && token === stored) {
    return new Response(challenge ?? "", { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return new Response("Forbidden", { status: 403 });
}

// POST — terima event dari Meta (Instagram DM, IG comment, Messenger DM, FB comment)
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ received: true });

  try {
    const object: string = body.object ?? "";

    for (const entry of body.entry ?? []) {
      const entryId: string = entry.id ?? "";

      // ─── Instagram ──────────────────────────────────────────────────────
      if (object === "instagram") {
        // IG DMs
        for (const msg of entry.messaging ?? []) {
          if (!msg.message) continue;
          if (msg.message?.is_echo) continue; // skip echo dari pesan yang dikirim page
          const senderId: string = msg.sender?.id ?? "";
          const text: string = msg.message?.text ?? "";
          const mid: string = msg.message?.mid ?? "";
          if (!senderId || !mid) continue;
          if (senderId === entryId) continue; // skip kalau pengirim adalah akun IG sendiri

          const ch = await prisma.metaChannel.findFirst({
            where: { igAccountId: entryId, type: "INSTAGRAM", active: true },
          });
          if (!ch) continue;

          // Fetch nama pengirim dari Graph API
          const senderName = await getMetaUserName(senderId, ch.pageAccessToken);

          await ingestIncoming({
            channel: "INSTAGRAM",
            channelAccountId: ch.id,
            from: senderId,
            name: senderName ?? undefined,
            text,
            externalId: mid,
            metaSubType: "DM",
          });
        }

        // IG Comments
        for (const change of entry.changes ?? []) {
          if (change.field !== "comments") continue;
          const v = change.value ?? {};
          const commentId: string = v.id ?? "";
          const commentText: string = v.text ?? "";
          const fromId: string = v.from?.id ?? "";
          const fromUsername: string = v.from?.username ?? "";
          if (!commentId || !fromId) continue;
          if (fromId === entryId) continue; // skip komentar dari akun IG sendiri

          const ch = await prisma.metaChannel.findFirst({
            where: { igAccountId: entryId, type: "INSTAGRAM", active: true },
          });
          if (!ch) continue;

          // Komentar sudah punya username dari payload, pakai langsung
          const nameFromComment = fromUsername || await getMetaUserName(fromId, ch.pageAccessToken);

          await ingestIncoming({
            channel: "INSTAGRAM",
            channelAccountId: ch.id,
            from: fromId,
            name: nameFromComment ?? undefined,
            text: `[Komentar IG] ${commentText}`,
            externalId: commentId,
            metaSubType: "COMMENT",
          });
        }
      }

      // ─── Messenger / Facebook ────────────────────────────────────────────
      if (object === "page") {
        // Messenger DMs
        for (const msg of entry.messaging ?? []) {
          if (!msg.message) continue;
          if (msg.message?.is_echo) continue; // skip echo dari pesan yang dikirim page
          const senderId: string = msg.sender?.id ?? "";
          const text: string = msg.message?.text ?? "";
          const mid: string = msg.message?.mid ?? "";
          if (!senderId || !mid) continue;
          if (senderId === entryId) continue; // skip kalau pengirim adalah page sendiri

          const ch = await prisma.metaChannel.findFirst({
            where: { pageId: entryId, type: "MESSENGER", active: true },
          });
          if (!ch) continue;

          // Fetch nama pengirim dari Graph API
          const senderName = await getMetaUserName(senderId, ch.pageAccessToken);

          await ingestIncoming({
            channel: "MESSENGER",
            channelAccountId: ch.id,
            from: senderId,
            name: senderName ?? undefined,
            text,
            externalId: mid,
            metaSubType: "DM",
          });
        }

        // Facebook Comments (from Page feed)
        for (const change of entry.changes ?? []) {
          if (change.field !== "feed") continue;
          const v = change.value ?? {};
          if (v.item !== "comment") continue;
          const commentId: string = v.comment_id ?? "";
          const commentText: string = v.message ?? "";
          const fromId: string = v.from?.id ?? "";
          const fromName: string = v.from?.name ?? "";
          if (!commentId || !fromId) continue;
          if (fromId === entryId) continue; // skip komentar dari page sendiri

          const ch = await prisma.metaChannel.findFirst({
            where: { pageId: entryId, type: "MESSENGER", active: true },
          });
          if (!ch) continue;

          await ingestIncoming({
            channel: "MESSENGER",
            channelAccountId: ch.id,
            from: fromId,
            name: fromName || undefined,
            text: `[Komentar FB] ${commentText}`,
            externalId: commentId,
            metaSubType: "COMMENT",
          });
        }
      }
    }
  } catch (e) {
    console.error("meta webhook POST error:", e);
  }

  return NextResponse.json({ received: true });
}
