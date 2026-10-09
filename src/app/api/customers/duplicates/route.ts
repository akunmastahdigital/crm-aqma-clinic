import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/customers/duplicates?id=xxx
// Cari customer lain yang namanya sama (case-insensitive) di channel berbeda.
// Dipakai untuk menampilkan banner "Mungkin duplikat?" di panel customer.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ duplicates: [] });

  const customer = await prisma.customer.findUnique({
    where: { id },
    select: { id: true, name: true, channel: true },
  });
  if (!customer?.name?.trim()) return NextResponse.json({ duplicates: [] });

  const name = customer.name.trim();

  // Cari customer lain dengan nama sama persis (case-insensitive), channel berbeda
  const duplicates = await prisma.customer.findMany({
    where: {
      id: { not: id },
      name: { equals: name, mode: "insensitive" },
      channel: { not: customer.channel },
    },
    select: { id: true, name: true, phone: true, externalId: true, channel: true, tags: true },
    take: 5,
  });

  return NextResponse.json({ duplicates });
}
