import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  if (id !== session.uid && !["OWNER", "SUPERADMIN", "SUPERVISOR"].includes(session.role))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { telegramId } = await req.json().catch(() => ({}));
  const user = await prisma.user.update({
    where: { id },
    data: { telegramId: telegramId ? String(telegramId).trim() : null },
    select: { id: true, telegramId: true },
  });
  return NextResponse.json({ user });
}
