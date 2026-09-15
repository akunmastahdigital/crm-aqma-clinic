import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";

const WORKER = process.env.WA_WORKER_URL || "http://127.0.0.1:3041";
const SECRET = process.env.INTERNAL_SECRET || "";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(session.role, "manage_channels"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  try {
    const r = await fetch(`${WORKER}/status`, {
      headers: { "x-internal-secret": SECRET },
      cache: "no-store",
    });
    return NextResponse.json(await r.json());
  } catch {
    return NextResponse.json({ connected: false, qr: null, number: null, offline: true });
  }
}

export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(session.role, "manage_channels"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  try {
    await fetch(`${WORKER}/logout`, {
      method: "POST",
      headers: { "x-internal-secret": SECRET },
    });
  } catch {}
  return NextResponse.json({ ok: true });
}
