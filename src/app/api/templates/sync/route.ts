import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { syncTemplates } from "@/lib/templates";

export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(session.role, "manage_templates"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  try {
    const count = await syncTemplates();
    return NextResponse.json({ ok: true, count });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "sync gagal" },
      { status: 502 },
    );
  }
}
