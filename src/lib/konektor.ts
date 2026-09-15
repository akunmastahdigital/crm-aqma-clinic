import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import { ensureDefaultPipeline } from "@/lib/crm";
import { notifyLead } from "@/lib/notify";

// Verifikasi tanda tangan webhook Konektor (timing-safe) memakai RAW body.
export function verifyKonektorSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): boolean {
  if (!signatureHeader) return false;
  const parts = signatureHeader.split(",");
  const timestamp = parts.find((p) => p.startsWith("t="))?.slice(2);
  const signature = parts.find((p) => p.startsWith("v1="))?.slice(3);
  if (!timestamp || !signature) return false;

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestamp)) > 300) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  try {
    const providedBuf = Buffer.from(signature, "hex");
    const expectedBuf = Buffer.from(expected, "hex");
    if (providedBuf.length !== expectedBuf.length) return false;
    return crypto.timingSafeEqual(providedBuf, expectedBuf);
  } catch {
    return false;
  }
}

type KLead = {
  id: string;
  uniqueCode?: string;
  externalRef?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  status?: string | null;
  priority?: string | null;
  city?: string | null;
  country?: string | null;
};

const digits = (s?: string | null) => (s ? s.replace(/\D/g, "") : "");

// Sinkronkan 1 lead Konektor ke Customer (+ kartu pipeline). Idempotent (upsert).
export async function syncKonektorLead(
  event: string,
  lead: KLead,
  meta: { source?: string; previousStatus?: string; newStatus?: string; changes?: string[] } = {},
) {
  if (!lead?.id) return;
  const phone = digits(lead.phone);
  const name = [lead.firstName, lead.lastName].filter(Boolean).join(" ").trim() || null;

  // 1) cari via konektorId, lalu via nomor telepon (WA_CLOUD) biar nyatu dgn chat WA
  let customer = await prisma.customer.findUnique({ where: { konektorId: lead.id } });
  if (!customer && phone) {
    customer = await prisma.customer.findUnique({
      where: { channel_externalId: { channel: "WA_CLOUD", externalId: phone } },
    });
  }

  const data = {
    konektorId: lead.id,
    source: meta.source || "konektor",
    ...(name ? { name } : {}),
    ...(phone ? { phone } : {}),
    ...(lead.email ? { email: lead.email } : {}),
    ...(lead.status ? { leadStatus: lead.status } : {}),
    ...(lead.priority ? { priority: lead.priority } : {}),
  };

  const isNew = !customer;
  if (customer) {
    customer = await prisma.customer.update({ where: { id: customer.id }, data });
  } else {
    customer = await prisma.customer.create({
      data: {
        channel: "WA_CLOUD",
        externalId: phone || `konektor:${lead.id}`,
        ...data,
      },
    });
  }

  // 2) pastikan ada kartu pipeline di pipeline default (sekali saja per lead)
  const existingDeal = await prisma.deal.findFirst({ where: { customerId: customer.id } });
  if (!existingDeal) {
    const pipeline = await ensureDefaultPipeline();
    const firstStage = pipeline.stages.sort((a, b) => a.order - b.order)[0];
    if (firstStage) {
      await prisma.deal.create({
        data: {
          pipelineId: pipeline.id,
          stageId: firstStage.id,
          customerId: customer.id,
          title: name || phone || lead.uniqueCode || "Lead Konektor",
          order: await prisma.deal.count({ where: { stageId: firstStage.id } }),
        },
      });
    }
  }

  // 3) notifikasi lead baru (hanya saat created)
  if (isNew || event === "lead.created") {
    void notifyLead({
      name: name || phone || lead.uniqueCode || "Lead baru",
      phone: phone || null,
      status: lead.status || meta.newStatus || null,
      customerId: customer.id,
    });
  }

  return { customerId: customer.id, isNew };
}
