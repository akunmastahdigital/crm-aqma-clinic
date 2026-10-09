import { prisma } from "@/lib/db";
import { broadcastInbox } from "@/lib/sse-hub";

// Update status pesan keluar (ceklis) tanpa turun tingkat.
// status: "delivered" | "read" | "failed" (nilai "sent" diabaikan — default sudah SENT).
export async function updateMessageStatus(wamid: string, status: string) {
  if (!wamid) return;
  const where = { externalId: wamid };

  let updated = 0;
  if (status === "delivered")
    updated = (await prisma.message.updateMany({
      where: { ...where, status: "SENT" },
      data: { status: "DELIVERED" },
    })).count;
  else if (status === "read")
    updated = (await prisma.message.updateMany({
      where: { ...where, status: { in: ["SENT", "DELIVERED"] } },
      data: { status: "READ" },
    })).count;
  else if (status === "failed")
    updated = (await prisma.message.updateMany({
      where: { ...where, status: { in: ["SENT", "DELIVERED"] } },
      data: { status: "FAILED" },
    })).count;

  // Broadcast SSE ke inbox UI agar ceklis langsung berubah tanpa refresh manual
  if (updated > 0) {
    const msg = await prisma.message.findFirst({
      where: { externalId: wamid },
      select: { conversationId: true },
    });
    if (msg?.conversationId) broadcastInbox(msg.conversationId, "outgoing");
  }
}
