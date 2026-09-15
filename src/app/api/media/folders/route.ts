import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(session.role, "manage_templates"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { name } = await req.json() as { name: string };
  if (!name?.trim()) return NextResponse.json({ error: "Nama folder wajib diisi" }, { status: 400 });

  const folder = await prisma.mediaFolder.create({ data: { name: name.trim() } });
  return NextResponse.json({ folder });
}
