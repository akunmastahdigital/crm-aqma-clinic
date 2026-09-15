import { prisma } from "@/lib/db";

// Update status pesan keluar (ceklis) tanpa turun tingkat.
// status: "delivered" | "read" | "failed" (nilai "sent" diabaikan — default sudah SENT).
export async function updateMessageStatus(wamid: string, status: string) {
  if (!wamid) return;
  const where = { externalId: wamid };
  if (status === "delivered")
    await prisma.message.updateMany({
      where: { ...where, status: "SENT" },
      data: { status: "DELIVERED" },
    });
  else if (status === "read")
    await prisma.message.updateMany({
      where: { ...where, status: { in: ["SENT", "DELIVERED"] } },
      data: { status: "READ" },
    });
  else if (status === "failed")
    await prisma.message.updateMany({
      where: { ...where, status: { in: ["SENT", "DELIVERED"] } },
      data: { status: "FAILED" },
    });
}
