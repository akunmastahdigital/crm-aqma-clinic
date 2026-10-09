import { NextResponse } from "next/server";
import { getSession, hashPassword, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// POST /api/auth/change-password
// Body: { currentPassword, newPassword }
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { currentPassword, newPassword } = (await req.json()) as {
    currentPassword?: string;
    newPassword?: string;
  };

  if (!currentPassword || !newPassword)
    return NextResponse.json({ error: "Password lama dan baru wajib diisi" }, { status: 400 });

  // CRM ini menyimpan data pasien, jadi minimal 8 karakter — bukan 6.
  if (newPassword.length < 8)
    return NextResponse.json({ error: "Password baru minimal 8 karakter" }, { status: 400 });

  const user = await prisma.user.findUnique({
    where: { id: session.uid },
    select: { passwordHash: true },
  });
  if (!user) return NextResponse.json({ error: "User tidak ditemukan" }, { status: 404 });

  const valid = await verifyPassword(currentPassword, user.passwordHash);
  if (!valid)
    return NextResponse.json({ error: "Password lama tidak sesuai" }, { status: 400 });

  await prisma.user.update({
    where: { id: session.uid },
    data: { passwordHash: await hashPassword(newPassword) },
  });

  return NextResponse.json({ ok: true });
}
