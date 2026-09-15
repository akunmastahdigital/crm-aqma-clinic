import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const domains = await prisma.trackingDomain.findMany({ orderBy: { createdAt: "asc" } });
  return NextResponse.json({ domains });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { domain, label } = await req.json();
  if (!domain) return NextResponse.json({ error: "Domain diperlukan" }, { status: 400 });
  const raw = domain.replace(/\/$/, "").toLowerCase().trim();
  const clean = raw.startsWith("http") ? raw : "https://" + raw;
  const exists = await prisma.trackingDomain.findUnique({ where: { domain: clean } });
  if (exists) return NextResponse.json({ error: "Domain sudah terdaftar" }, { status: 409 });
  const d = await prisma.trackingDomain.create({ data: { domain: clean, label } });
  return NextResponse.json({ domain: d });
}
