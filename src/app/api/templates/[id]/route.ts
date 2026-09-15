import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { deleteWabaTemplate, updateWabaTemplate } from "@/lib/waba";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

// DELETE — hapus template dari Meta + DB (semua bahasa dengan nama yang sama)
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const template = await prisma.template.findUnique({ where: { id } });
  if (!template) return NextResponse.json({ error: "Template tidak ditemukan" }, { status: 404 });

  const channel = await prisma.wabaChannel.findFirst({
    where: { wabaId: template.wabaId, active: true },
    select: { accessToken: true },
  });
  if (!channel) return NextResponse.json({ error: "Channel WABA tidak ditemukan" }, { status: 404 });

  try {
    await deleteWabaTemplate(template.wabaId, channel.accessToken, template.name);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Gagal hapus di Meta: ${msg}` }, { status: 422 });
  }

  // Hapus semua bahasa dengan nama yang sama dari DB
  await prisma.template.deleteMany({
    where: { wabaId: template.wabaId, name: template.name },
  });

  return NextResponse.json({ ok: true });
}

// PATCH — update isi template di Meta + sinkron DB
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const template = await prisma.template.findUnique({ where: { id } });
  if (!template) return NextResponse.json({ error: "Template tidak ditemukan" }, { status: 404 });
  if (!template.metaId) return NextResponse.json({ error: "Template belum punya Meta ID" }, { status: 400 });

  const channel = await prisma.wabaChannel.findFirst({
    where: { wabaId: template.wabaId, active: true },
    select: { accessToken: true },
  });
  if (!channel) return NextResponse.json({ error: "Channel WABA tidak ditemukan" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const { category, header, bodyText, footer, buttons } = body as {
    category?: string;
    header?: string;
    bodyText?: string;
    footer?: string;
    buttons?: Array<{ kind: "QUICK_REPLY" | "URL" | "PHONE_NUMBER"; text: string; url?: string; phone?: string }>;
  };

  if (!bodyText?.trim()) return NextResponse.json({ error: "Body wajib diisi" }, { status: 400 });

  const components: Array<{ type: string; format?: string; text?: string }> = [];
  if (header?.trim()) components.push({ type: "HEADER", format: "TEXT", text: header.trim() });
  components.push({ type: "BODY", text: bodyText.trim() });
  if (footer?.trim()) components.push({ type: "FOOTER", text: footer.trim() });

  if (buttons && buttons.length > 0) {
    const btnList = buttons
      .filter((b) => b.text?.trim())
      .map((b) => {
        if (b.kind === "QUICK_REPLY")  return { type: "QUICK_REPLY",  text: b.text.trim() };
        if (b.kind === "URL")          return { type: "URL",          text: b.text.trim(), url: b.url?.trim() ?? "" };
        if (b.kind === "PHONE_NUMBER") return { type: "PHONE_NUMBER", text: b.text.trim(), phone_number: b.phone?.trim() ?? "" };
        return null;
      })
      .filter(Boolean);
    if (btnList.length) components.push({ type: "BUTTONS", buttons: btnList } as never);
  }

  try {
    await updateWabaTemplate(template.metaId, channel.accessToken, components, category);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Gagal update di Meta: ${msg}` }, { status: 422 });
  }

  const updated = await prisma.template.update({
    where: { id },
    data: {
      category: category ?? template.category,
      bodyText: bodyText.trim(),
      components: components as Prisma.InputJsonValue,
      status: "PENDING",
    },
  });

  return NextResponse.json({ ok: true, id: updated.id });
}
