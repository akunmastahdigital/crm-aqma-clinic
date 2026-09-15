import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const items = await prisma.quickReply.findMany({
    orderBy: [{ category: "asc" }, { order: "asc" }],
  });
  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(session.role, "manage_automation"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  let shortcut = (body.shortcut ?? "").toString().trim();
  if (!shortcut) return NextResponse.json({ error: "shortcut wajib" }, { status: 400 });
  if (!shortcut.startsWith("/")) shortcut = "/" + shortcut;
  shortcut = shortcut.replace(/\s+/g, "").toLowerCase();

  const text = (body.text ?? "").toString();
  const attachments = Array.isArray(body.attachments) ? body.attachments : [];
  if (!text.trim() && attachments.length === 0)
    return NextResponse.json({ error: "isi teks atau lampiran" }, { status: 400 });

  const exists = await prisma.quickReply.findUnique({ where: { shortcut } });
  if (exists)
    return NextResponse.json({ error: "shortcut sudah dipakai" }, { status: 400 });

  const item = await prisma.quickReply.create({
    data: {
      shortcut,
      category: body.category ? body.category.toString().trim() : null,
      title: body.title ? body.title.toString().trim() : null,
      text: text || null,
      attachments,
    },
  });
  return NextResponse.json({ item });
}
