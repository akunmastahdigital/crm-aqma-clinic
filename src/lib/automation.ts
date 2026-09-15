import { prisma } from "@/lib/db";
import { deliverOutbound } from "@/lib/delivery";

type Att = { url: string; type: string; name?: string };

function textMatches(text: string, keywords: string[]): boolean {
  const t = text.toLowerCase();
  return keywords.some((k) => k.trim() && t.includes(k.trim().toLowerCase()));
}

async function sendSystemMessages(convId: string, text: string, attachments: Att[]) {
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
    await deliverOutbound(convId, { text, attachments });
  }
}

export async function runAutomations(opts: {
  customerId: string;
  conversationId: string;
  text: string;
  isFirstMessage: boolean;
}) {
  const { customerId, conversationId, text, isFirstMessage } = opts;

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
  const outs: { text: string; attachments: Att[] }[] = [];
  if (isFirstMessage) {
    const fm = replies.find((r) => r.trigger === "FIRST_MESSAGE");
    if (fm) outs.push({ text: fm.replyText ?? "", attachments: (fm.attachments as Att[]) ?? [] });
  }
  const kw = replies.find((r) => r.trigger === "KEYWORD" && textMatches(text, r.keywords));
  if (kw) outs.push({ text: kw.replyText ?? "", attachments: (kw.attachments as Att[]) ?? [] });

  for (const o of outs) await sendSystemMessages(conversationId, o.text, o.attachments);

  return { taggedWith: toAdd, autoReplied: outs.length };
}
