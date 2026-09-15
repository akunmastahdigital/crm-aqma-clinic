import { NextResponse } from "next/server";
import { execSync } from "child_process";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const SECRET = process.env.INTERNAL_SECRET || "";

// GET /api/channels/wa-qr-channels/[id] — status dari worker
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(session.role, "manage_channels"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await params;
  const channel = await prisma.waQrChannel.findUnique({ where: { id } });
  if (!channel) return NextResponse.json({ error: "not found" }, { status: 404 });

  try {
    const r = await fetch(`http://127.0.0.1:${channel.port}/status`, {
      headers: { "x-internal-secret": SECRET },
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    const data = await r.json();
    // Simpan nomor yang terkoneksi ke database
    if (data.connected && data.number && data.number !== channel.phone) {
      await prisma.waQrChannel.update({ where: { id }, data: { phone: data.number } });
    }
    return NextResponse.json({ ...data, channelId: id });
  } catch {
    return NextResponse.json({ connected: false, qr: null, number: null, offline: true, channelId: id });
  }
}

// POST /api/channels/wa-qr-channels/[id] — logout
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(session.role, "manage_channels"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await params;
  const channel = await prisma.waQrChannel.findUnique({ where: { id } });
  if (!channel) return NextResponse.json({ error: "not found" }, { status: 404 });

  try {
    await fetch(`http://127.0.0.1:${channel.port}/logout`, {
      method: "POST",
      headers: { "x-internal-secret": SECRET },
      signal: AbortSignal.timeout(3000),
    });
  } catch {}
  await prisma.waQrChannel.update({ where: { id }, data: { phone: null } });
  return NextResponse.json({ ok: true });
}

// DELETE /api/channels/wa-qr-channels/[id] — hapus channel + stop worker
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(session.role, "manage_channels"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await params;
  const channel = await prisma.waQrChannel.findUnique({ where: { id } });
  if (!channel) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Stop PM2 worker
  try {
    execSync(`pm2 delete ${channel.pm2Name}`, { timeout: 5000 });
  } catch {}

  await prisma.waQrChannel.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
