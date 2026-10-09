import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" } });
}

const PIPELINE_NAME = "Sales Web Chat";
const STAGE_NAME = "New Lead";

async function ensureWebChatPipeline() {
  let pipeline = await prisma.pipeline.findFirst({ where: { name: PIPELINE_NAME } });
  if (!pipeline) {
    pipeline = await prisma.pipeline.create({ data: { name: PIPELINE_NAME } });
    await prisma.stage.create({ data: { pipelineId: pipeline.id, name: STAGE_NAME, order: 0, color: "#6366f1" } });
  }
  return pipeline;
}

// POST /api/webchat/session/[token]/identify
// Body: { name: string, phone: string }
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = await req.json().catch(() => ({}));
  const { name, phone } = body as { name?: string; phone?: string };

  if (!name?.trim() || !phone?.trim()) {
    return NextResponse.json({ error: "Nama dan nomor WhatsApp wajib diisi" }, { status: 400 });
  }

  const session = await prisma.webChatSession.findUnique({ where: { token } });
  if (!session) return NextResponse.json({ error: "Session tidak ditemukan" }, { status: 404 });
  if (session.identified) return NextResponse.json({ ok: true, alreadyIdentified: true });

  // Normalize phone
  const rawPhone = phone.replace(/\D/g, "");
  const normalizedPhone = rawPhone.startsWith("62") ? rawPhone
    : rawPhone.startsWith("0") ? "62" + rawPhone.slice(1)
    : "62" + rawPhone;

  // Upsert customer dengan channel WEBCHAT
  const customer = await prisma.customer.upsert({
    where: { channel_externalId: { channel: "WEBCHAT", externalId: normalizedPhone } },
    create: { channel: "WEBCHAT", externalId: normalizedPhone, name: name.trim(), phone: normalizedPhone, lastContactAt: new Date() },
    update: { name: name.trim(), phone: normalizedPhone, lastContactAt: new Date() },
  });

  // Buat conversation WEBCHAT jika belum ada
  let conv = session.conversationId
    ? await prisma.conversation.findUnique({ where: { id: session.conversationId } })
    : null;

  if (!conv) {
    conv = await prisma.conversation.create({
      data: { customerId: customer.id, channel: "WEBCHAT", status: "OPEN" },
    });
  }

  // Update session
  await prisma.webChatSession.update({
    where: { token },
    data: { visitorName: name.trim(), visitorPhone: normalizedPhone, customerId: customer.id, conversationId: conv.id, identified: true, lastActiveAt: new Date() },
  });

  // Auto-tambah ke pipeline Sales Web Chat
  const pipeline = await ensureWebChatPipeline();
  const stage = await prisma.stage.findFirst({ where: { pipelineId: pipeline.id, name: STAGE_NAME } });
  if (stage) {
    const existingDeal = await prisma.deal.findFirst({ where: { customerId: customer.id, pipelineId: pipeline.id } });
    if (!existingDeal) {
      await prisma.deal.create({ data: { customerId: customer.id, pipelineId: pipeline.id, stageId: stage.id, title: name.trim() } });
    }
  }

  return NextResponse.json({ ok: true, conversationId: conv.id });
}
