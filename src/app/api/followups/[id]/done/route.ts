import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (session.role === "GUEST") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  await prisma.followUp.update({
    where: { id },
    data: { status: "DONE", doneAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
