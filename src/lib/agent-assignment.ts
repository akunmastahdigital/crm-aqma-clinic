import { prisma } from "./db";

// Dipanggil setiap kali agent kirim pesan di suatu conversation.
// - Kalau belum terdaftar → tambah sebagai PRIMARY (jika belum ada) atau PENDING
// - Lalu cek apakah ada PENDING yang sudah memenuhi syarat secondary
export async function recordAgentMessage(conversationId: string, agentId: string): Promise<void> {
  const existing = await prisma.conversationAgent.findUnique({
    where: { conversationId_agentId: { conversationId, agentId } },
    select: { role: true },
  });

  if (!existing) {
    const hasPrimary = await prisma.conversationAgent.findFirst({
      where: { conversationId, role: "PRIMARY" },
      select: { id: true },
    });
    await prisma.conversationAgent.create({
      data: {
        conversationId,
        agentId,
        role: hasPrimary ? "PENDING" : "PRIMARY",
        joinedAt: new Date(),
      },
    });
  }

  void checkPendingQualifications(conversationId);
}

// Dipanggil setiap kali ada pesan masuk (IN) agar hitungan lead terbaru dievaluasi.
export async function onIncomingMessage(conversationId: string): Promise<void> {
  void checkPendingQualifications(conversationId);
}

async function getThresholds(): Promise<{ minIncoming: number; minReplies: number }> {
  let s = await prisma.appSettings.findUnique({ where: { id: "singleton" } });
  if (!s) s = await prisma.appSettings.create({ data: { id: "singleton" } });
  return { minIncoming: s.secondaryMinIncoming, minReplies: s.secondaryMinReplies };
}

async function checkPendingQualifications(conversationId: string): Promise<void> {
  const pendingAgents = await prisma.conversationAgent.findMany({
    where: { conversationId, role: "PENDING" },
    select: { id: true, agentId: true, joinedAt: true },
  });

  if (pendingAgents.length === 0) return;

  const { minIncoming, minReplies } = await getThresholds();

  for (const pending of pendingAgents) {
    const [leadCount, agentCount] = await Promise.all([
      prisma.message.count({
        where: {
          conversationId,
          direction: "IN",
          createdAt: { gt: pending.joinedAt },
        },
      }),
      prisma.message.count({
        where: {
          conversationId,
          direction: "OUT",
          authorId: pending.agentId,
          createdAt: { gt: pending.joinedAt },
        },
      }),
    ]);

    if (leadCount >= minIncoming && agentCount >= minReplies) {
      await prisma.conversationAgent.update({
        where: { id: pending.id },
        data: { role: "SECONDARY", qualifiedAt: new Date() },
      });
    }
  }
}

// Ambil semua agent yang handle conversation (untuk UI dan kredit closing)
export async function getConversationAgents(conversationId: string) {
  return prisma.conversationAgent.findMany({
    where: {
      conversationId,
      role: { in: ["PRIMARY", "SECONDARY"] },
    },
    select: {
      role: true,
      joinedAt: true,
      qualifiedAt: true,
      agent: { select: { id: true, name: true, avatarUrl: true } },
    },
    orderBy: { joinedAt: "asc" },
  });
}

// Ambil semua agentId yang berhak dapat kredit closing untuk suatu customer
// (primary + secondary dari semua conversation customer itu)
export async function getHandlerAgentIds(customerId: string): Promise<string[]> {
  const conversations = await prisma.conversation.findMany({
    where: { customerId },
    select: { id: true },
  });
  const convIds = conversations.map((c) => c.id);
  if (convIds.length === 0) return [];

  const agents = await prisma.conversationAgent.findMany({
    where: {
      conversationId: { in: convIds },
      role: { in: ["PRIMARY", "SECONDARY"] },
    },
    select: { agentId: true },
    distinct: ["agentId"],
  });

  return agents.map((a) => a.agentId);
}
