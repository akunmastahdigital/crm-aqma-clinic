import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { sendWabaTemplate } from "@/lib/waba";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (session.role === "GUEST") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const templateName = (body.templateName ?? "").toString().trim();
  const language = (body.language ?? "id").toString().trim();

  if (!templateName) return NextResponse.json({ error: "templateName wajib diisi" }, { status: 400 });

  // Ambil conversation + customer phone + channel credentials
  const conv = await prisma.conversation.findFirst({
    where: { id },
    include: {
      customer: { select: { externalId: true, channel: true } },
    },
  });
  if (!conv) return NextResponse.json({ error: "percakapan tidak ditemukan" }, { status: 404 });
  if (conv.customer.channel !== "WA_CLOUD")
    return NextResponse.json({ error: "template hanya untuk WA_CLOUD" }, { status: 400 });

  if (!conv.channelAccountId)
    return NextResponse.json({ error: "channel tidak terkonfigurasi" }, { status: 400 });

  const channel = await prisma.wabaChannel.findUnique({
    where: { phoneNumberId: conv.channelAccountId },
  });
  if (!channel) return NextResponse.json({ error: "channel tidak ditemukan" }, { status: 404 });

  try {
    await sendWabaTemplate(
      channel.phoneNumberId,
      conv.customer.externalId,
      templateName,
      language,
      channel.accessToken,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "gagal kirim template";
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  // Ambil isi bodyText template dari DB supaya bubble menampilkan pesan asli
  const tpl = await prisma.template.findFirst({
    where: { name: templateName, language },
    select: { bodyText: true },
  });
  const label = tpl?.bodyText?.trim() || `[Template] ${templateName}`;
  const authorExists = await prisma.user.findUnique({ where: { id: session.uid }, select: { id: true } });
  const authorId = authorExists ? session.uid : null;

  const message = await prisma.message.create({
    data: {
      conversationId: id,
      direction: "OUT",
      text: label,
      status: "SENT",
      authorId,
    },
  });

  await prisma.conversation.update({
    where: { id },
    data: { lastMessageAt: new Date(), lastMessageText: label },
  });

  return NextResponse.json({ message });
}
