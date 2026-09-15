import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(session.role, "manage_channels"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const channels = await prisma.wabaChannel.findMany({
    orderBy: { label: "asc" },
    select: { id: true, label: true, wabaId: true, phoneNumberId: true, displayPhone: true, active: true, createdAt: true },
  });
  return NextResponse.json({ channels });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(session.role, "manage_channels"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { label, wabaId, phoneNumberId, accessToken, displayPhone } = body;

  if (!label?.trim() || !wabaId?.trim() || !phoneNumberId?.trim() || !accessToken?.trim())
    return NextResponse.json({ error: "label, wabaId, phoneNumberId, dan accessToken wajib diisi" }, { status: 400 });

  // Cek duplikat phoneNumberId
  const existing = await prisma.wabaChannel.findUnique({ where: { phoneNumberId: phoneNumberId.trim() } });
  if (existing)
    return NextResponse.json({ error: "phoneNumberId sudah terdaftar" }, { status: 409 });

  const channel = await prisma.wabaChannel.create({
    data: {
      label: label.trim(),
      wabaId: wabaId.trim(),
      phoneNumberId: phoneNumberId.trim(),
      accessToken: accessToken.trim(),
      displayPhone: displayPhone?.trim() || null,
      active: true,
    },
  });

  return NextResponse.json({ channel });
}
