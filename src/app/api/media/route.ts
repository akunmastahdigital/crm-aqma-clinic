import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { saveMedia, type SavedMedia } from "@/lib/storage";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const MAX = 15 * 1024 * 1024; // 15MB per file

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sp = new URL(req.url).searchParams;
  const folderId = sp.get("folderId"); // null = semua, "root" = tanpa folder

  const where = folderId === "root"
    ? { folderId: null }
    : folderId
    ? { folderId }
    : {};

  const [items, folders, allItems] = await Promise.all([
    prisma.media.findMany({ where, orderBy: { createdAt: "desc" }, take: 300 }),
    prisma.mediaFolder.findMany({ orderBy: { name: "asc" } }),
    prisma.media.findMany({ select: { size: true } }),
  ]);

  const used = allItems.reduce((a, m) => a + m.size, 0);
  return NextResponse.json({ items, folders, used });
}

export async function DELETE(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({})) as { ids?: string[] };
  const ids = Array.isArray(body.ids) ? body.ids.filter(Boolean) : [];
  if (ids.length === 0) return NextResponse.json({ error: "ids kosong" }, { status: 400 });
  await prisma.media.deleteMany({ where: { id: { in: ids } } });
  return NextResponse.json({ deleted: ids.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const noLibrary = url.searchParams.get("noLibrary") === "true";
  const folderId = url.searchParams.get("folderId") ?? undefined;

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "form tidak valid" }, { status: 400 });

  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0)
    return NextResponse.json({ error: "tidak ada file" }, { status: 400 });

  const saved: SavedMedia[] = [];
  for (const file of files) {
    if (file.size > MAX)
      return NextResponse.json({ error: `${file.name} melebihi 15MB` }, { status: 400 });
    const buf = Buffer.from(await file.arrayBuffer());
    const m = await saveMedia(buf, file.name, file.type || "application/octet-stream");
    saved.push(m);
    if (!noLibrary) {
      await prisma.media.create({
        data: {
          url: m.url, name: m.name, type: m.type, size: file.size,
          createdById: session.uid,
          ...(folderId ? { folderId } : {}),
        },
      });
    }
  }
  return NextResponse.json({ media: saved });
}
