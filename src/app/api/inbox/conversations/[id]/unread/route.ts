import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { markUnread } from "@/lib/inbox";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  await markUnread(id, session);
  return NextResponse.json({ ok: true });
}
