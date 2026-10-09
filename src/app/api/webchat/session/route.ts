import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" } });
}

// POST /api/webchat/session
// Body: { token?: string } — jika token ada dan valid, resume; jika tidak, buat baru
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { token } = body as { token?: string };

  if (token) {
    const existing = await prisma.webChatSession.findUnique({
      where: { token },
      select: { token: true, visitorName: true, visitorPhone: true, identified: true, conversationId: true },
    });
    if (existing) {
      await prisma.webChatSession.update({ where: { token }, data: { lastActiveAt: new Date() } });
      return NextResponse.json({ token: existing.token, identified: existing.identified, visitorName: existing.visitorName });
    }
  }

  // Buat session baru
  const session = await prisma.webChatSession.create({
    data: { lastActiveAt: new Date() },
    select: { token: true, identified: true, visitorName: true },
  });
  return NextResponse.json({ token: session.token, identified: false, visitorName: null });
}
