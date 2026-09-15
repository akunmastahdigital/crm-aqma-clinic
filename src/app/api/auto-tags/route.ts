import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const items = await prisma.autoTag.findMany({ orderBy: { createdAt: "asc" } });
  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(session.role, "manage_automation"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const tag = (body.tag ?? "").toString().trim();
  const keywords = Array.isArray(body.keywords)
    ? body.keywords.map((k: unknown) => String(k).trim()).filter(Boolean)
    : [];
  if (!tag) return NextResponse.json({ error: "nama tag wajib" }, { status: 400 });
  if (keywords.length === 0)
    return NextResponse.json({ error: "isi minimal 1 kata kunci" }, { status: 400 });

  const item = await prisma.autoTag.create({ data: { tag, keywords } });
  return NextResponse.json({ item });
}
