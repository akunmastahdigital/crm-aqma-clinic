import { NextResponse } from "next/server";
import { execSync } from "child_process";
import { mkdirSync } from "fs";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const WORKER_SCRIPT = "/root/work/crm-aqma-clinic/worker/wa-qr.mjs";
const BASE_AUTH_DIR = process.env.WA_AUTH_DIR || "/root/work/crm-aqma-clinic/.wa-auth";
const BASE_PORT = 3051;

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

  // Tentukan port berikutnya (max port yang ada + 1, minimal BASE_PORT)
  const last = await prisma.waQrChannel.findFirst({ orderBy: { port: "desc" } });
  const port = last ? last.port + 1 : BASE_PORT;

  // Buat record dulu untuk dapat id (gunakan timestamp agar unique constraint tidak bentrok)
  const tmpKey = Date.now().toString(36);
  const channel = await prisma.waQrChannel.create({
    data: {
      label: label.trim(),
      port,
      authDir: `${BASE_AUTH_DIR}/init-${tmpKey}`,
      pm2Name: `aqma-wa-qr-init-${tmpKey}`,
    },
  });

  const authDir = `${BASE_AUTH_DIR}/${channel.id}`;
  const pm2Name = `aqma-wa-qr-${channel.id}`;

  await prisma.waQrChannel.update({
    where: { id: channel.id },
    data: { authDir, pm2Name },
  });

  // Buat direktori auth
  mkdirSync(authDir, { recursive: true });

  // Start PM2 worker
  try {
    const env = {
      ...process.env,
      WA_CHANNEL_ID: channel.id,
      WA_WORKER_PORT: String(port),
      WA_AUTH_DIR: authDir,
    };
    execSync(`pm2 start ${WORKER_SCRIPT} --name ${pm2Name}`, { env, timeout: 10000 });
  } catch (e) {
    console.error("pm2 start error:", e);
    // Tetap return success — worker bisa di-start manual
  }

  return NextResponse.json({ channel: { ...channel, authDir, pm2Name } });
}
