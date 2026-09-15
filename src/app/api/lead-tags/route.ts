import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const tags = await prisma.leadTag.findMany({ orderBy: { createdAt: "asc" } });
  return NextResponse.json({ tags });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(session.role, "manage_crm_settings"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { name, color } = await req.json() as { name?: string; color?: string };
  if (!name?.trim()) return NextResponse.json({ error: "Nama wajib diisi" }, { status: 400 });

  const tag = await prisma.leadTag.create({
    data: { name: name.trim(), color: color ?? "#6366f1" },
  });
  return NextResponse.json({ tag });
}
