import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;

  const recipients = await prisma.broadcastRecipient.findMany({
    where: { jobId: id },
    orderBy: { id: "asc" },
    select: {
      id: true, to: true, status: true, error: true, wamid: true, customerId: true,
    },
  });

  // BroadcastRecipient.customerId memang hanya kolom biasa, bukan relasi Prisma,
  // jadi nama penerima diambil lewat query terpisah.
  const customerIds = recipients.map((r) => r.customerId).filter(Boolean) as string[];
  const customers = customerIds.length
    ? await prisma.customer.findMany({
        where: { id: { in: customerIds } },
        select: { id: true, name: true },
      })
    : [];
  const nameById = new Map(customers.map((c) => [c.id, c.name]));

  // Ambil status delivery dari tabel messages berdasarkan wamid
  const wamids = recipients.map((r) => r.wamid).filter(Boolean) as string[];
  const messages = wamids.length
    ? await prisma.message.findMany({
        where: { externalId: { in: wamids } },
        select: { externalId: true, status: true },
      })
    : [];
  const msgStatus: Record<string, string> = {};
  for (const m of messages) if (m.externalId) msgStatus[m.externalId] = m.status;

  return NextResponse.json({
    recipients: recipients.map((r) => ({
      id: r.id,
      to: r.to,
      name: r.customerId ? (nameById.get(r.customerId) ?? null) : null,
      status: r.status,
      error: r.error ?? null,
      wamid: r.wamid ?? null,
      deliveryStatus: r.wamid ? (msgStatus[r.wamid] ?? null) : null,
    })),
  });
}
