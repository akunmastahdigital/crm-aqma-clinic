import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { randomBytes } from "crypto";

export const dynamic = "force-dynamic";

// GET — ambil semua MetaChannel + verify token (auto-generate kalau belum ada)
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Generate verify token kalau belum ada
  let verifyToken: string;
  const setting = await prisma.crmSetting.findUnique({ where: { key: "meta_webhook_verify_token" } });
  if (setting) {
    verifyToken = JSON.parse(setting.value) as string;
  } else {
    verifyToken = randomBytes(24).toString("hex");
    await prisma.crmSetting.create({
      data: { key: "meta_webhook_verify_token", value: JSON.stringify(verifyToken) },
    });
  }

  const channels = await prisma.metaChannel.findMany({ orderBy: { createdAt: "asc" } });
  return NextResponse.json({ channels, verifyToken });
}

// POST — tambah MetaChannel baru
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { type, pageId, pageAccessToken, igAccountId, label } = body as {
    type: string; pageId: string; pageAccessToken: string; igAccountId?: string; label: string;
  };

  if (!type || !pageId || !pageAccessToken || !label) {
    return NextResponse.json({ error: "Semua field wajib diisi." }, { status: 400 });
  }
  if (type !== "INSTAGRAM" && type !== "MESSENGER") {
    return NextResponse.json({ error: "Type harus INSTAGRAM atau MESSENGER." }, { status: 400 });
  }
  if (type === "INSTAGRAM" && !igAccountId) {
    return NextResponse.json({ error: "IG Account ID wajib diisi untuk Instagram." }, { status: 400 });
  }

  const ch = await prisma.metaChannel.create({
    data: { type: type as "INSTAGRAM" | "MESSENGER", pageId, pageAccessToken, igAccountId: igAccountId ?? null, label },
  });
  return NextResponse.json({ ok: true, id: ch.id });
}
