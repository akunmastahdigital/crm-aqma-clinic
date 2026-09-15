import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const steps = await prisma.conversationFlow.findMany({
    orderBy: { order: "asc" },
  });
  return NextResponse.json({ steps });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(session.role, "manage_ai"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { stepType = "keyword", name, keywords = [], message, mediaUrl, mediaName } = body;

  if (!name?.trim() || !message?.trim())
    return NextResponse.json({ error: "name dan message wajib diisi" }, { status: 400 });

  // Ambil order terbesar + 1
  const last = await prisma.conversationFlow.findFirst({ orderBy: { order: "desc" } });
  const order = (last?.order ?? -1) + 1;

  const step = await prisma.conversationFlow.create({
    data: {
      stepType,
      name: name.trim(),
      keywords: Array.isArray(keywords)
        ? keywords.map((k: string) => k.trim()).filter(Boolean)
        : [],
      message: message.trim(),
      mediaUrl: mediaUrl?.trim() || null,
      mediaName: mediaName?.trim() || null,
      order,
    },
  });
  return NextResponse.json({ step }, { status: 201 });
}

// Reorder: PUT /api/ai/flow dengan body { ids: string[] }
export async function PUT(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(session.role, "manage_ai"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { ids } = await req.json().catch(() => ({ ids: [] }));
  if (!Array.isArray(ids)) return NextResponse.json({ error: "ids harus array" }, { status: 400 });

  await Promise.all(
    ids.map((id: string, idx: number) =>
      prisma.conversationFlow.update({ where: { id }, data: { order: idx } }),
    ),
  );
  return NextResponse.json({ ok: true });
}
