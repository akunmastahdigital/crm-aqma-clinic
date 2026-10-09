import { prisma } from "@/lib/db";
import { sendWabaTemplate } from "@/lib/waba";

async function upsertConvForBroadcast(to: string, channelAccountId: string) {
  const now = new Date();
  const customer = await prisma.customer.upsert({
    where: { channel_externalId: { channel: "WA_CLOUD", externalId: to } },
    update: { lastContactAt: now },
    create: { channel: "WA_CLOUD", externalId: to, phone: to, lastContactAt: now },
  });
  let conv = await prisma.conversation.findFirst({
    where: { customerId: customer.id, status: { not: "CLOSED" }, channelAccountId },
    orderBy: { lastMessageAt: "desc" },
  });
  if (!conv)
    conv = await prisma.conversation.create({
      data: { customerId: customer.id, channel: "WA_CLOUD", channelAccountId, status: "OPEN" },
    });
  return conv;
}

const DELAY_MS = 1500; // jeda antar kirim biar nomor aman

export async function createBroadcast(input: {
  channelAccountId: string;
  templateName: string;
  templateLang: string;
  customerIds: string[];
  createdById?: string;
}) {
  const customers = await prisma.customer.findMany({
    where: { id: { in: input.customerIds } },
    select: { id: true, externalId: true },
  });
  if (customers.length === 0) throw new Error("Tidak ada penerima");

  const job = await prisma.broadcastJob.create({
    data: {
      templateName: input.templateName,
      templateLang: input.templateLang,
      channelAccountId: input.channelAccountId,
      total: customers.length,
      createdById: input.createdById ?? null,
      recipients: {
        create: customers.map((c) => ({ customerId: c.id, to: c.externalId })),
      },
    },
  });

  // jalan di background (proses Node yang sama) — jangan di-await
  void processBroadcast(job.id).catch((e) => console.error("broadcast error:", e));
  return job;
}

async function processBroadcast(jobId: string) {
  const job = await prisma.broadcastJob.findUnique({ where: { id: jobId } });
  if (!job) return;
  const channel = await prisma.wabaChannel.findUnique({
    where: { phoneNumberId: job.channelAccountId },
  });
  if (!channel || !channel.active) {
    await prisma.broadcastJob.update({
      where: { id: jobId },
      data: { status: "failed", finishedAt: new Date() },
    });
    return;
  }

  const recipients = await prisma.broadcastRecipient.findMany({
    where: { jobId, status: "pending" },
  });
  let sent = 0;
  let failed = 0;
  for (const r of recipients) {
    try {
      const tplData = await sendWabaTemplate(
        channel.phoneNumberId,
        r.to,
        job.templateName,
        job.templateLang,
        channel.accessToken,
      );
      const wamid: string | null = (tplData as { messages?: Array<{ id?: string }> })?.messages?.[0]?.id ?? null;
      // Simpan pesan BC ke conversation lead agar tampil di inbox + bisa track status
      try {
        const conv = await upsertConvForBroadcast(r.to, channel.phoneNumberId);
        const label = `[BC] ${job.templateName}`;
        const now = new Date();
        await prisma.message.create({
          data: { conversationId: conv.id, direction: "OUT", text: label, status: "SENT", externalId: wamid },
        });
        await prisma.conversation.update({
          where: { id: conv.id },
          data: { lastMessageAt: now, lastMessageText: label },
        });
      } catch {}
      await prisma.broadcastRecipient.update({
        where: { id: r.id },
        data: { status: "sent", wamid },
      });
      sent++;
    } catch (e) {
      await prisma.broadcastRecipient.update({
        where: { id: r.id },
        data: { status: "failed", error: (e instanceof Error ? e.message : "gagal").slice(0, 200) },
      });
      failed++;
    }
    await prisma.broadcastJob.update({ where: { id: jobId }, data: { sent, failed } });
    await new Promise((res) => setTimeout(res, DELAY_MS));
  }

  await prisma.broadcastJob.update({
    where: { id: jobId },
    data: { status: "done", finishedAt: new Date(), sent, failed },
  });
}
