import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

async function getOrCreate() {
  let s = await prisma.appSettings.findUnique({ where: { id: "singleton" } });
  if (!s) s = await prisma.appSettings.create({ data: { id: "singleton" } });
  return s;
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const s = await getOrCreate();
  return NextResponse.json({
    secondaryMinIncoming: s.secondaryMinIncoming,
    secondaryMinReplies: s.secondaryMinReplies,
    overdueThresholdMinutes: s.overdueThresholdMinutes,
    overdueExcludeTags: s.overdueExcludeTags,
    overdueExcludeFailClose: s.overdueExcludeFailClose,
  });
}

export async function PUT(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(session.role, "manage_crm_settings"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  await getOrCreate();

  const clamp = (v: unknown, min: number, max: number) =>
    Math.max(min, Math.min(max, Math.round(Number(v) || min)));

  const toTags = (v: unknown) =>
    Array.isArray(v) ? v.map((t) => String(t).trim()).filter(Boolean) : [];

  const data: Record<string, unknown> = {};
  if ("secondaryMinIncoming" in body) data.secondaryMinIncoming = clamp(body.secondaryMinIncoming, 1, 50);
  if ("secondaryMinReplies" in body) data.secondaryMinReplies = clamp(body.secondaryMinReplies, 1, 50);
  if ("overdueThresholdMinutes" in body) data.overdueThresholdMinutes = clamp(body.overdueThresholdMinutes, 1, 60);
  if ("overdueExcludeTags" in body) data.overdueExcludeTags = toTags(body.overdueExcludeTags);
  if ("overdueExcludeFailClose" in body) data.overdueExcludeFailClose = !!body.overdueExcludeFailClose;

  await prisma.appSettings.update({ where: { id: "singleton" }, data });
  return NextResponse.json({ ok: true });
}
