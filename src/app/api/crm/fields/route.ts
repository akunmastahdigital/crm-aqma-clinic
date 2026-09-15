import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const TYPES = ["TEXT", "NUMBER", "SELECT", "DATE"] as const;

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const fields = await prisma.customField.findMany({ orderBy: { order: "asc" } });
  return NextResponse.json({ fields });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(session.role, "manage_crm_settings"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const label = (body.label ?? "").toString().trim();
  if (!label) return NextResponse.json({ error: "label wajib" }, { status: 400 });
  const type = TYPES.includes(body.type) ? body.type : "TEXT";
  const key =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "") +
    "_" +
    Math.floor(Date.now() / 1000).toString(36);
  const options =
    type === "SELECT" && Array.isArray(body.options)
      ? body.options.map((o: unknown) => String(o).trim()).filter(Boolean)
      : [];
  const count = await prisma.customField.count();
  const field = await prisma.customField.create({
    data: { label, key, type, options, order: count },
  });
  return NextResponse.json({ field });
}
