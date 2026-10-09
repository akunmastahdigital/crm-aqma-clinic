import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/db";

async function guard() {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  if (!can(session.role, "manage_automation"))
    return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  return { session };
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await guard();
  if (g.error) return g.error;
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  // Kalau hanya toggle active
  if (Object.keys(body).length === 1 && "active" in body) {
    const item = await prisma.autoReply.update({ where: { id }, data: { active: !!body.active } });
    return NextResponse.json({ item });
  }

  // Full update (edit aturan)
  const VALID_CHANNELS = ["WA_CLOUD", "WA_QR", "INSTAGRAM", "MESSENGER", "WEBCHAT"];
  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = String(body.name).trim();
  if (body.trigger !== undefined) data.trigger = body.trigger === "FIRST_MESSAGE" ? "FIRST_MESSAGE" : "KEYWORD";
  if (body.keywords !== undefined)
    data.keywords = Array.isArray(body.keywords)
      ? body.keywords.map((k: unknown) => String(k).trim()).filter(Boolean)
      : [];
  if (body.replyText !== undefined) data.replyText = String(body.replyText) || null;
  if (body.attachments !== undefined) data.attachments = Array.isArray(body.attachments) ? body.attachments : [];
  if (body.buttons !== undefined)
    data.buttons = Array.isArray(body.buttons)
      ? body.buttons.filter((b: { type?: string; label?: string; value?: string }) =>
          (b.type === "quick_reply" || b.type === "url") && b.label?.trim() && b.value?.trim()
        )
      : [];
  if (body.channels !== undefined)
    data.channels = Array.isArray(body.channels)
      ? body.channels.filter((c: unknown) => VALID_CHANNELS.includes(String(c)))
      : [];
  if (body.aiRephrase !== undefined) data.aiRephrase = !!body.aiRephrase;
  if (body.delayMin !== undefined) data.delayMin = Math.max(0, Math.min(300, Number(body.delayMin) || 0));
  if (body.delayMax !== undefined) data.delayMax = Math.max(Number(data.delayMin ?? 0), Math.min(300, Number(body.delayMax) || 0));

  const item = await prisma.autoReply.update({ where: { id }, data });
  return NextResponse.json({ item });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await guard();
  if (g.error) return g.error;
  const { id } = await params;
  await prisma.autoReply.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
