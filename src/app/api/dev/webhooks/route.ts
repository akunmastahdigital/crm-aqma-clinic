import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const VALID_EVENTS = ["message.received", "message.sent"];

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(session.role, "manage_channels"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const endpoints = await prisma.webhookEndpoint.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json({ endpoints });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(session.role, "manage_channels"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const url = (body.url ?? "").toString().trim();
  if (!/^https?:\/\//.test(url))
    return NextResponse.json({ error: "URL tidak valid" }, { status: 400 });
  const events = Array.isArray(body.events)
    ? body.events.filter((e: unknown) => VALID_EVENTS.includes(String(e)))
    : [];
  if (events.length === 0)
    return NextResponse.json({ error: "pilih minimal 1 event" }, { status: 400 });
  const secret = body.secret ? body.secret.toString() : null;
  const endpoint = await prisma.webhookEndpoint.create({ data: { url, events, secret } });
  return NextResponse.json({ endpoint });
}
