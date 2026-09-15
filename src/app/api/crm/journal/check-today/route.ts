import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const customerId = searchParams.get("customerId");
  if (!customerId) return NextResponse.json({ hasEntry: false });

  // Batas hari ini di WIB (UTC+7)
  const now = new Date();
  const jakartaOffset = 7 * 60 * 60 * 1000;
  const nowJakarta = new Date(now.getTime() + jakartaOffset);
  const startOfDay = new Date(
    Date.UTC(nowJakarta.getUTCFullYear(), nowJakarta.getUTCMonth(), nowJakarta.getUTCDate())
  );
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

  const entry = await prisma.salesJournal.findFirst({
    where: {
      customerId,
      userId: session.uid,
      createdAt: { gte: startOfDay, lt: endOfDay },
    },
    select: { id: true },
  });

  return NextResponse.json({ hasEntry: !!entry });
}
