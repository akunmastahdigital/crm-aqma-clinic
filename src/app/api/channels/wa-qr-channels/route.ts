import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// WA QR sekarang lewat WAHA (container Docker), bukan Baileys + pm2 seperti dulu.
// Port aplikasi dibaca dari env supaya tidak bentrok dengan app lain di server ini.
const APP_PORT = process.env.PORT || "3050";
const WAHA_URL = process.env.WAHA_URL || "http://127.0.0.1:3055";
const WAHA_API_KEY = process.env.WAHA_API_KEY || "";
const APP_URL = process.env.APP_URL || `http://127.0.0.1:${APP_PORT}`;
// Webhook harus bisa dicapai dari dalam container — pakai host.docker.internal
const WEBHOOK_HOST = APP_URL.includes("127.0.0.1") || APP_URL.includes("localhost")
  ? `http://host.docker.internal:${APP_PORT}`
  : APP_URL;

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(session.role, "manage_channels"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const channels = await prisma.waQrChannel.findMany({ orderBy: { createdAt: "asc" } });
  return NextResponse.json({ channels });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(session.role, "manage_channels"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { label } = await req.json().catch(() => ({}));
  if (!label?.trim()) return NextResponse.json({ error: "label wajib diisi" }, { status: 400 });

  // Port unik — pakai nilai besar (30000+) agar tidak bentrok dengan baileys lama
  const last = await prisma.waQrChannel.findFirst({ orderBy: { port: "desc" } });
  const port = last ? Math.max(last.port + 1, 30001) : 30001;

  const tmpKey = Date.now().toString(36);
  const channel = await prisma.waQrChannel.create({
    data: {
      label: label.trim(),
      port,
      authDir: `/tmp/waha-init-${tmpKey}`,
      pm2Name: `waha-init-${tmpKey}`,
    },
  });

  const sessionName = `waha-${channel.id}`;
  await prisma.waQrChannel.update({
    where: { id: channel.id },
    data: {
      authDir: `/tmp/waha-${channel.id}`,
      pm2Name: sessionName,
    },
  });

  // Buat WAHA session
  try {
    const r = await fetch(`${WAHA_URL}/api/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": WAHA_API_KEY,
      },
      body: JSON.stringify({
        name: sessionName,
        config: {
          webhooks: [{
            url: `${WEBHOOK_HOST}/api/internal/waha-webhook`,
            events: ["message"],
          }],
        },
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) {
      const err = await r.text().catch(() => "");
      console.error("WAHA create session error:", r.status, err);
    }
  } catch (e) {
    console.error("WAHA create session error:", e);
  }

  return NextResponse.json({ channel: { ...channel, pm2Name: sessionName } });
}
