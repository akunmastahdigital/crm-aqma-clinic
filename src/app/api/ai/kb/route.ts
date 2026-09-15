import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const items = await prisma.knowledgeBase.findMany({ orderBy: { createdAt: "asc" } });
  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(session.role, "manage_ai"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const title = (body.title ?? "").toString().trim();
  const content = (body.content ?? "").toString().trim();
  if (!title || !content)
    return NextResponse.json({ error: "judul & isi wajib" }, { status: 400 });
  const item = await prisma.knowledgeBase.create({ data: { title, content } });
  return NextResponse.json({ item });
}
