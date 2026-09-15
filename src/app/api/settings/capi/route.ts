import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getCapiSettings, sendCapiEvent } from "@/lib/meta-capi";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const settings = await getCapiSettings();
  return NextResponse.json(settings);
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { pixelId, accessToken, pixelName } = await req.json();
  await prisma.crmSetting.upsert({ where: { key: "capi_pixel_id" }, update: { value: pixelId ?? "" }, create: { key: "capi_pixel_id", value: pixelId ?? "" } });
  await prisma.crmSetting.upsert({ where: { key: "capi_access_token" }, update: { value: accessToken ?? "" }, create: { key: "capi_access_token", value: accessToken ?? "" } });
  await prisma.crmSetting.upsert({ where: { key: "capi_pixel_name" }, update: { value: pixelName ?? "" }, create: { key: "capi_pixel_name", value: pixelName ?? "" } });
  return NextResponse.json({ ok: true });
}

export async function PUT(req: Request) {
  // Test: kirim test event ke Meta
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ua = req.headers.get("user-agent") ?? "Mozilla/5.0 (test)";
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "127.0.0.1";
  const result = await sendCapiEvent({
    eventName: "Lead",
    eventId: "test-" + Date.now(),
    clientIpAddress: ip,
    clientUserAgent: ua,
  });
  return NextResponse.json(result ?? { status: "no_config", response: "Pixel ID atau Access Token belum diisi" });
}
