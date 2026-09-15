import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rules = await prisma.crmRule.findMany({ orderBy: { createdAt: "asc" } });
  return NextResponse.json({ rules });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const rule = await prisma.crmRule.create({
    data: {
      name: body.name,
      isActive: body.isActive ?? true,
      conditions: body.conditions ?? [],
      actions: body.actions ?? [],
    },
  });
  return NextResponse.json({ rule });
}

export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, ...data } = await req.json();
  const rule = await prisma.crmRule.update({ where: { id }, data });
  return NextResponse.json({ rule });
}

export async function DELETE(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await req.json();
  await prisma.crmRule.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
