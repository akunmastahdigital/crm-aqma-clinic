import { prisma } from "@/lib/db";
import { deliverOutbound } from "@/lib/delivery";
import { getAiSettings, callAiRaw } from "@/lib/ai";
import type { WaButton } from "@/lib/waba";

type Att = { url: string; type: string; name?: string };

function randomDelay(min: number, max: number): number {
  if (min <= 0 && max <= 0) return 0;
  const lo = Math.max(0, min);
  const hi = Math.max(lo, max);
  return (Math.floor(Math.random() * (hi - lo + 1)) + lo) * 1000;
}

async function rephraseText(text: string): Promise<string> {
  try {
    const settings = await getAiSettings();
    const result = await callAiRaw(settings, [
      {
        role: "system",
        content: "Kamu adalah asisten yang membantu memparafrase pesan WhatsApp bisnis. Tulis ulang pesan berikut dengan kalimat yang berbeda tapi makna, informasi, dan konteks SAMA PERSIS. Pertahankan semua URL, angka, nama produk, dan data penting. Jangan tambah atau kurangi informasi. Balas HANYA dengan teks hasil parafrase, tanpa penjelasan tambahan.",
      },
      { role: "user", content: text },
    ]);
    return result || text;
  } catch {
    return text; // fallback ke teks asli jika AI error
  }
}

function textMatches(text: string, keywords: string[]): boolean {
  const t = text.toLowerCase();
  return keywords.some((k) => k.trim() && t.includes(k.trim().toLowerCase()));
}

async function sendSystemMessages(convId: string, text: string, attachments: Att[], buttons: WaButton[] = []) {
  const created: unknown[] = [];
  if (text.trim()) {
    created.push(
      await prisma.message.create({
        data: { conversationId: convId, direction: "OUT", text, status: "SENT" },
      }),
    );
  }
  for (const a of attachments) {
    created.push(
      await prisma.message.create({
        data: {
          conversationId: convId,
          direction: "OUT",
          mediaUrl: a.url,
          mediaType: a.type,
          text: a.name ?? null,
          status: "SENT",
        },
      }),
    );
  }
  const preview = text.trim() || (attachments.length ? `[${attachments[0].type}]` : "");
  if (created.length) {
    await prisma.conversation.update({
      where: { id: convId },
      data: { lastMessageAt: new Date(), lastMessageText: preview },
    });
    // kirim ke channel asli (WA_CLOUD dll); SIMULATOR = no-op
    await deliverOutbound(convId, { text, attachments, buttons });
  }
}

export async function runAutomations(opts: {
  customerId: string;
  conversationId: string;
  text: string;
  isFirstMessage: boolean;
  channel?: string;
}) {
  const { customerId, conversationId, text, isFirstMessage, channel } = opts;

  // --- TAG OTOMATIS ---
  const autoTags = await prisma.autoTag.findMany({ where: { active: true } });
  const toAdd: string[] = [];
  for (const t of autoTags) {
    if (t.tag && textMatches(text, t.keywords)) toAdd.push(t.tag);
  }
  if (toAdd.length) {
    const cust = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { tags: true },
    });
    const merged = [...new Set([...(cust?.tags ?? []), ...toAdd])];
    await prisma.customer.update({ where: { id: customerId }, data: { tags: merged } });
  }

  // --- BALAS OTOMATIS ---
  const replies = await prisma.autoReply.findMany({
    where: { active: true },
    orderBy: { order: "asc" },
  });

  // Filter: aturan berlaku jika channels kosong (semua) ATAU channel conversation ada di daftar
  const applicable = replies.filter((r) => r.channels.length === 0 || (channel && r.channels.includes(channel)));

  const outs: { text: string; attachments: Att[]; buttons: WaButton[]; aiRephrase: boolean; delayMin: number; delayMax: number }[] = [];
  if (isFirstMessage) {
    const fm = applicable.find((r) => r.trigger === "FIRST_MESSAGE");
    if (fm) outs.push({ text: fm.replyText ?? "", attachments: (fm.attachments as Att[]) ?? [], buttons: (fm.buttons as WaButton[]) ?? [], aiRephrase: fm.aiRephrase, delayMin: fm.delayMin, delayMax: fm.delayMax });
  }
  const kw = applicable.find((r) => r.trigger === "KEYWORD" && textMatches(text, r.keywords));
  if (kw) outs.push({ text: kw.replyText ?? "", attachments: (kw.attachments as Att[]) ?? [], buttons: (kw.buttons as WaButton[]) ?? [], aiRephrase: kw.aiRephrase, delayMin: kw.delayMin, delayMax: kw.delayMax });

  for (const o of outs) {
    const delay = randomDelay(o.delayMin, o.delayMax);
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));

    let finalText = o.text;
    if (o.aiRephrase && finalText.trim()) {
      finalText = await rephraseText(finalText);
    }

    await sendSystemMessages(conversationId, finalText, o.attachments, o.buttons);
  }

  return { taggedWith: toAdd, autoReplied: outs.length };
}
