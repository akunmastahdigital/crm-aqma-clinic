import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/inbox/by-customer?customerId=xxx
// Kembalikan conversationId terbaru untuk customer tertentu
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const customerId = new URL(req.url).searchParams.get("customerId");
  if (!customerId) return NextResponse.json({ conversationId: null });

  const conv = await prisma.conversation.findFirst({
    where: { customerId },
    orderBy: { lastMessageAt: "desc" },
    select: { id: true },
  });

  return NextResponse.json({ conversationId: conv?.id ?? null });
}
