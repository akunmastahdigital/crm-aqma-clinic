import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createWabaTemplate } from "@/lib/waba";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const [templates, channels] = await Promise.all([
    prisma.template.findMany({ orderBy: [{ name: "asc" }] }),
    prisma.wabaChannel.findMany({ select: { wabaId: true, label: true } }),
  ]);
  const wabaLabel: Record<string, string> = {};
  for (const c of channels) wabaLabel[c.wabaId] = c.label;
  return NextResponse.json({ templates, wabaLabel });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { wabaId, name, language, category, header, bodyText, footer, buttons } = body as {
    wabaId?: string; name?: string; language?: string; category?: string;
    header?: string; bodyText?: string; footer?: string;
    buttons?: Array<{ kind: "QUICK_REPLY" | "URL" | "PHONE_NUMBER"; text: string; url?: string; phone?: string }>;
  };

  if (!wabaId || !name || !language || !category || !bodyText?.trim()) {
    return NextResponse.json({ error: "wabaId, name, language, category, dan bodyText wajib diisi" }, { status: 400 });
  }

  // Normalize name: lowercase, spasi → _, strip karakter selain a-z0-9_
  const normalizedName = name.toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/__+/g, "_").replace(/^_|_$/g, "");
  if (!normalizedName) return NextResponse.json({ error: "Nama template tidak valid" }, { status: 400 });

  const channel = await prisma.wabaChannel.findFirst({
    where: { wabaId, active: true },
    select: { wabaId: true, accessToken: true },
  });
  if (!channel) return NextResponse.json({ error: "Channel WABA tidak ditemukan" }, { status: 404 });

  // Susun komponen
  const components: Array<{ type: string; format?: string; text?: string }> = [];
  if (header?.trim()) components.push({ type: "HEADER", format: "TEXT", text: header.trim() });
  components.push({ type: "BODY", text: bodyText.trim() });
  if (footer?.trim()) components.push({ type: "FOOTER", text: footer.trim() });

  if (buttons && buttons.length > 0) {
    const btnList = buttons
      .filter(b => b.text?.trim())
      .map(b => {
        if (b.kind === "QUICK_REPLY") return { type: "QUICK_REPLY", text: b.text.trim() };
        if (b.kind === "URL")         return { type: "URL",         text: b.text.trim(), url: b.url?.trim() ?? "" };
        if (b.kind === "PHONE_NUMBER") return { type: "PHONE_NUMBER", text: b.text.trim(), phone_number: b.phone?.trim() ?? "" };
        return null;
      })
      .filter(Boolean);
    if (btnList.length) components.push({ type: "BUTTONS", buttons: btnList } as never);
  }

  let metaResult: { id: string; status: string } = { id: "", status: "PENDING" };
  try {
    metaResult = await createWabaTemplate(channel.wabaId, channel.accessToken, {
      name: normalizedName,
      language,
      category,
      components,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 422 });
  }

  // Simpan ke DB
  const saved = await prisma.template.upsert({
    where: { wabaId_name_language: { wabaId: channel.wabaId, name: normalizedName, language } },
    update: { metaId: metaResult.id, category, status: metaResult.status ?? "PENDING", bodyText: bodyText.trim(), components: components as Prisma.InputJsonValue },
    create: {
      wabaId: channel.wabaId,
      metaId: metaResult.id,
      name: normalizedName,
      language,
      category,
      status: metaResult.status ?? "PENDING",
      bodyText: bodyText.trim(),
      components: components as Prisma.InputJsonValue,
    },
  });

  return NextResponse.json({ ok: true, id: saved.id, metaId: metaResult.id, status: metaResult.status });
}
