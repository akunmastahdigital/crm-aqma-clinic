import { prisma } from "@/lib/db";

type ClosingDef = {
  useLabel: boolean;
  labels: string[];
  useStage: boolean;
  stages: string[];
};

async function getClosingDef(): Promise<ClosingDef> {
  const row = await prisma.crmSetting.findUnique({ where: { key: "closing_definition" } });
  if (!row) return { useLabel: false, labels: [], useStage: false, stages: [] };
  try {
    return JSON.parse(row.value) as ClosingDef;
  } catch {
    return { useLabel: false, labels: [], useStage: false, stages: [] };
  }
}

export async function checkAndMarkClosing(customerId: string): Promise<void> {
  const [def, customer] = await Promise.all([
    getClosingDef(),
    prisma.customer.findUnique({
      where: { id: customerId },
      select: {
        id: true,
        tags: true,
        closedAt: true,
        deals: { select: { stageId: true } },
        conversations: {
          orderBy: { createdAt: "asc" },
          take: 1,
          select: { createdAt: true },
        },
      },
    }),
  ]);

  if (!customer) return;
  // Sudah pernah closing — jangan timpa
  if (customer.closedAt) return;

  // Tidak ada kondisi closing yang aktif — skip
  if (!def.useLabel && !def.useStage) return;

  let isClosing = false;

  if (def.useLabel && def.labels.length > 0) {
    isClosing = customer.tags.some((t) => def.labels.includes(t));
  }

  if (!isClosing && def.useStage && def.stages.length > 0) {
    isClosing = customer.deals.some((d) => d.stageId && def.stages.includes(d.stageId));
  }

  if (!isClosing) return;

  // Hitung durasi dari chat pertama ke sekarang
  const firstChatAt = customer.conversations[0]?.createdAt ?? null;
  const now = new Date();
  const timeToCloseMinutes = firstChatAt
    ? Math.round((now.getTime() - firstChatAt.getTime()) / 60_000)
    : null;

  await prisma.customer.update({
    where: { id: customerId },
    data: { closedAt: now, timeToCloseMinutes },
  });
}
