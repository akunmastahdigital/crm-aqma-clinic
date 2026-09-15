import { prisma } from "@/lib/db";
import { sendWabaTemplate } from "@/lib/waba";

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
      await sendWabaTemplate(
        channel.phoneNumberId,
        r.to,
        job.templateName,
        job.templateLang,
        channel.accessToken,
      );
      await prisma.broadcastRecipient.update({
        where: { id: r.id },
        data: { status: "sent" },
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
