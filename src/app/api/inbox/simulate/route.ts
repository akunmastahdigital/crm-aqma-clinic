import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { simulateIncoming } from "@/lib/inbox";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const from = (body.from ?? "").toString().trim();
  const text = (body.text ?? "").toString().trim();
  const name = body.name ? body.name.toString().trim() : undefined;
  if (!from || !text)
    return NextResponse.json({ error: "from & text wajib" }, { status: 400 });
  const res = await simulateIncoming({ from, name, text });
  return NextResponse.json(res);
}
