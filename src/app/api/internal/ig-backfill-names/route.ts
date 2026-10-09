// Backfill username/nama untuk customer Instagram yang belum punya nama.
// Panggil sekali: POST /api/internal/ig-backfill-names
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getMetaUserName } from "@/lib/meta-messaging";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (req.headers.get("x-internal-secret") !== process.env.INTERNAL_SECRET)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // Ambil channel Instagram aktif (untuk access token)
  const ch = await prisma.metaChannel.findFirst({
    where: { type: "INSTAGRAM", active: true },
  });
  if (!ch) return NextResponse.json({ error: "no instagram channel" }, { status: 400 });

  // Semua customer IG tanpa nama
  const customers = await prisma.customer.findMany({
    where: { channel: "INSTAGRAM", OR: [{ name: null }, { name: "" }] },
    select: { id: true, externalId: true },
  });

  let updated = 0;
  let failed = 0;

  for (const c of customers) {
    const name = await getMetaUserName(c.externalId, ch.pageAccessToken);
    if (name) {
      await prisma.customer.update({ where: { id: c.id }, data: { name } });
      updated++;
    } else {
      failed++;
    }
    // Jeda kecil agar tidak hit rate limit Graph API
    await new Promise((r) => setTimeout(r, 150));
  }

  return NextResponse.json({ ok: true, total: customers.length, updated, failed });
}
