import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(session.role, "manage_ai"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};

  if ("name" in body) data.name = String(body.name).trim();
  if ("stepType" in body) data.stepType = String(body.stepType);
  if ("keywords" in body)
    data.keywords = Array.isArray(body.keywords)
      ? body.keywords.map((k: string) => k.trim()).filter(Boolean)
      : [];
  if ("message" in body) data.message = String(body.message).trim();
  if ("mediaUrl" in body) data.mediaUrl = body.mediaUrl ? String(body.mediaUrl).trim() : null;
  if ("mediaName" in body) data.mediaName = body.mediaName ? String(body.mediaName).trim() : null;
  if ("isActive" in body) data.isActive = !!body.isActive;

  const step = await prisma.conversationFlow.update({ where: { id }, data });
  return NextResponse.json({ step });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(session.role, "manage_ai"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await params;
  await prisma.conversationFlow.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
