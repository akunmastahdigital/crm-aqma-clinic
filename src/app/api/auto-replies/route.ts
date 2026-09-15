import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const items = await prisma.autoReply.findMany({ orderBy: { order: "asc" } });
  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(session.role, "manage_automation"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const name = (body.name ?? "").toString().trim();
  const trigger = body.trigger === "FIRST_MESSAGE" ? "FIRST_MESSAGE" : "KEYWORD";
  const keywords = Array.isArray(body.keywords)
    ? body.keywords.map((k: unknown) => String(k).trim()).filter(Boolean)
    : [];
  const replyText = (body.replyText ?? "").toString();
  const attachments = Array.isArray(body.attachments) ? body.attachments : [];

  if (!name) return NextResponse.json({ error: "nama wajib" }, { status: 400 });
  if (trigger === "KEYWORD" && keywords.length === 0)
    return NextResponse.json({ error: "isi minimal 1 kata kunci" }, { status: 400 });
  if (!replyText.trim() && attachments.length === 0)
    return NextResponse.json({ error: "isi balasan (teks/lampiran)" }, { status: 400 });

  const count = await prisma.autoReply.count();
  const item = await prisma.autoReply.create({
    data: { name, trigger, keywords, replyText: replyText || null, attachments, order: count },
  });
  return NextResponse.json({ item });
}
