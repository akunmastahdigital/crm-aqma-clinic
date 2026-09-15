import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!["OWNER", "SUPERADMIN", "SUPERVISOR"].includes(session.role))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id: packageTypeId } = await params;
  const body = await req.json().catch(() => ({}));
  const name = (body.name ?? "").toString().trim();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

  const variant = await prisma.packageVariant.create({
    data: { packageTypeId, name },
  });
  return NextResponse.json({ variant });
}
