import { NextResponse } from "next/server";
import { getSession, hashPassword } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import type { Role } from "@prisma/client";

export const dynamic = "force-dynamic";

const ROLES: Role[] = ["OWNER", "SUPERADMIN", "SUPERVISOR", "AGENT", "GUEST"];

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" } });
  const members = await Promise.all(
    users.map(async (u) => {
      const [messages, convRows, assigned] = await Promise.all([
        prisma.message.count({ where: { authorId: u.id, direction: "OUT" } }),
        prisma.message.findMany({
          where: { authorId: u.id, direction: "OUT" },
          distinct: ["conversationId"],
          select: { conversationId: true },
        }),
        prisma.conversation.count({ where: { assignedToId: u.id } }),
      ]);
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        active: u.active,
        telegramId: u.telegramId ?? null,
        lastLoginAt: u.lastLoginAt,
        stats: { messages, conversations: convRows.length, assigned },
      };
    }),
  );

  return NextResponse.json({
    members,
    canManage: can(session.role, "manage_users"),
    isOwner: session.role === "OWNER",
    me: session.uid,
  });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(session.role, "manage_users"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const name = (body.name ?? "").toString().trim();
  const email = (body.email ?? "").toString().trim().toLowerCase();
  const password = (body.password ?? "").toString();
  const role: Role = ROLES.includes(body.role) ? body.role : "AGENT";

  if (!name || !email || password.length < 6)
    return NextResponse.json({ error: "nama, email & password (min 6) wajib" }, { status: 400 });
  // hanya OWNER yang boleh mengangkat OWNER
  if (role === "OWNER" && session.role !== "OWNER")
    return NextResponse.json({ error: "hanya Owner yang bisa mengangkat Owner" }, { status: 403 });

  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) return NextResponse.json({ error: "email sudah dipakai" }, { status: 400 });

  const user = await prisma.user.create({
    data: { name, email, role, passwordHash: await hashPassword(password) },
  });
  return NextResponse.json({ user: { id: user.id, email: user.email } });
}
