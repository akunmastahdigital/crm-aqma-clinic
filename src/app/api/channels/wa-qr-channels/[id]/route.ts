import { NextResponse } from "next/server";
import { execSync } from "child_process";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const WAHA_URL = process.env.WAHA_URL || "http://127.0.0.1:3055";
const WAHA_API_KEY = process.env.WAHA_API_KEY || "";
const OLD_SECRET = process.env.INTERNAL_SECRET || "";

function isWaha(pm2Name: string) {
  return pm2Name.startsWith("waha-");
}

// GET /api/channels/wa-qr-channels/[id] — status koneksi + QR
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(session.role, "manage_channels"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await params;
  const channel = await prisma.waQrChannel.findUnique({ where: { id } });
  if (!channel) return NextResponse.json({ error: "not found" }, { status: 404 });

  // ── WAHA mode ──────────────────────────────────────────────────────────────
  if (isWaha(channel.pm2Name)) {
    try {
      const r = await fetch(`${WAHA_URL}/api/sessions/${channel.pm2Name}`, {
        headers: { "X-Api-Key": WAHA_API_KEY },
        signal: AbortSignal.timeout(5000),
      });
      if (!r.ok) return NextResponse.json({ connected: false, qr: null, number: null, offline: true, channelId: id });

      const wahaData = await r.json();
      let status: string = wahaData.status || "STOPPED";
      const connected = status === "WORKING";
      const number: string | null = wahaData.me?.id?.replace(/@.*$/, "") ?? null;

      // Simpan nomor ke DB kalau baru tersambung
      if (connected && number && number !== channel.phone) {
        await prisma.waQrChannel.update({ where: { id }, data: { phone: number } });
      }

      // Auto-restart session kalau STOPPED atau FAILED
      if (status === "STOPPED" || status === "FAILED") {
        try {
          if (status === "FAILED") {
            await fetch(`${WAHA_URL}/api/sessions/${channel.pm2Name}/stop`, {
              method: "POST",
              headers: { "X-Api-Key": WAHA_API_KEY },
              signal: AbortSignal.timeout(5000),
            });
            await new Promise((res) => setTimeout(res, 1500));
          }
          await fetch(`${WAHA_URL}/api/sessions/${channel.pm2Name}/start`, {
            method: "POST",
            headers: { "X-Api-Key": WAHA_API_KEY },
            signal: AbortSignal.timeout(5000),
          });
          await new Promise((res) => setTimeout(res, 2000));
          const r2 = await fetch(`${WAHA_URL}/api/sessions/${channel.pm2Name}`, {
            headers: { "X-Api-Key": WAHA_API_KEY },
            signal: AbortSignal.timeout(5000),
          });
          if (r2.ok) status = (await r2.json()).status || "STARTING";
        } catch { /* biarkan, retry berikutnya */ }
      }

      // Ambil QR jika sedang menunggu scan
      let qr: string | null = null;
      if (status === "SCAN_QR_CODE") {
        try {
          const qrRes = await fetch(`${WAHA_URL}/api/${channel.pm2Name}/auth/qr`, {
            headers: { "X-Api-Key": WAHA_API_KEY },
            signal: AbortSignal.timeout(5000),
          });
          if (qrRes.ok) {
            const ct = qrRes.headers.get("content-type") || "";
            if (ct.includes("image")) {
              // PNG bytes → data URL
              const buf = Buffer.from(await qrRes.arrayBuffer());
              qr = `data:image/png;base64,${buf.toString("base64")}`;
            } else {
              const json = await qrRes.json().catch(() => ({}));
              qr = json.value || null;
            }
          }
        } catch { /* QR tidak tersedia saat ini */ }
      }

      return NextResponse.json({ connected, qr, number, channelId: id });
    } catch {
      return NextResponse.json({ connected: false, qr: null, number: null, offline: true, channelId: id });
    }
  }

  // ── Baileys legacy mode ───────────────────────────────────────────────────
  try {
    const r = await fetch(`http://127.0.0.1:${channel.port}/status`, {
      headers: { "x-internal-secret": OLD_SECRET },
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    const data = await r.json();
    if (data.connected && data.number && data.number !== channel.phone) {
      await prisma.waQrChannel.update({ where: { id }, data: { phone: data.number } });
    }
    return NextResponse.json({ ...data, channelId: id });
  } catch {
    return NextResponse.json({ connected: false, qr: null, number: null, offline: true, channelId: id });
  }
}

// POST /api/channels/wa-qr-channels/[id] — logout / putuskan
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(session.role, "manage_channels"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await params;
  const channel = await prisma.waQrChannel.findUnique({ where: { id } });
  if (!channel) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (isWaha(channel.pm2Name)) {
    try {
      await fetch(`${WAHA_URL}/api/sessions/${channel.pm2Name}/stop`, {
        method: "POST",
        headers: { "X-Api-Key": WAHA_API_KEY },
        signal: AbortSignal.timeout(5000),
      });
    } catch {}
  } else {
    try {
      await fetch(`http://127.0.0.1:${channel.port}/logout`, {
        method: "POST",
        headers: { "x-internal-secret": OLD_SECRET },
        signal: AbortSignal.timeout(3000),
      });
    } catch {}
  }

  await prisma.waQrChannel.update({ where: { id }, data: { phone: null } });
  return NextResponse.json({ ok: true });
}

// DELETE /api/channels/wa-qr-channels/[id] — hapus channel
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(session.role, "manage_channels"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await params;
  const channel = await prisma.waQrChannel.findUnique({ where: { id } });
  if (!channel) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (isWaha(channel.pm2Name)) {
    try {
      await fetch(`${WAHA_URL}/api/sessions/${channel.pm2Name}`, {
        method: "DELETE",
        headers: { "X-Api-Key": WAHA_API_KEY },
        signal: AbortSignal.timeout(5000),
      });
    } catch {}
  } else {
    try { execSync(`pm2 delete ${channel.pm2Name}`, { timeout: 5000 }); } catch {}
  }

  await prisma.waQrChannel.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
