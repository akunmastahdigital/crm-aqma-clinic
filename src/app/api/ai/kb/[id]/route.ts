import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/db";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(session.role, "manage_ai"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  await prisma.knowledgeBase.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
