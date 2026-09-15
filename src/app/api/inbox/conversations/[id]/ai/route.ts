import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { setAiPaused } from "@/lib/inbox";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (session.role === "GUEST") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  await setAiPaused(id, !!body.paused, session);
  return NextResponse.json({ ok: true });
}
