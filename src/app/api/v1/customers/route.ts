import { NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/apikey";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/v1/customers — Header: Authorization: Bearer <API_KEY>
export async function GET(req: Request) {
  const key = await verifyApiKey(req);
  if (!key) return NextResponse.json({ error: "invalid api key" }, { status: 401 });
  const customers = await prisma.customer.findMany({
    take: 200,
    orderBy: { lastContactAt: "desc" },
    select: {
      id: true,
      name: true,
      phone: true,
      externalId: true,
      channel: true,
      tags: true,
      createdAt: true,
    },
  });
  return NextResponse.json({ customers });
}
