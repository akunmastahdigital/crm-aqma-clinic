import { prisma } from "@/lib/db";

const DEFAULT_STAGES = [
  { name: "Baru", color: "#6b7280" },
  { name: "Menghubungi", color: "#0ea5e9" },
  { name: "Penawaran", color: "#f59e0b" },
  { name: "Negosiasi", color: "#a855f7" },
  { name: "Menang", color: "#16a34a" },
  { name: "Kalah", color: "#dc2626" },
];

export async function ensureDefaultPipeline() {
  const existing = await prisma.pipeline.findFirst({
    where: { isDefault: true },
    include: { stages: true },
  });
  if (existing) return existing;

  // kalau sudah ada pipeline lain tapi belum ada default, jadikan yang pertama default
  const any = await prisma.pipeline.findFirst({ include: { stages: true } });
  if (any) {
    return prisma.pipeline.update({
      where: { id: any.id },
      data: { isDefault: true },
      include: { stages: true },
    });
  }

  return prisma.pipeline.create({
    data: {
      name: "Pipeline Penjualan",
      isDefault: true,
      stages: {
        create: DEFAULT_STAGES.map((s, i) => ({
          name: s.name,
          color: s.color,
          order: i,
        })),
      },
    },
    include: { stages: true },
  });
}

export async function listPipelines() {
  await ensureDefaultPipeline();
  return prisma.pipeline.findMany({
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    include: { _count: { select: { stages: true, deals: true } } },
  });
}

export async function createPipeline(name: string) {
  return prisma.pipeline.create({
    data: {
      name,
      stages: {
        create: [
          { name: "Baru", color: "#6b7280", order: 0 },
          { name: "Proses", color: "#0ea5e9", order: 1 },
          { name: "Selesai", color: "#16a34a", order: 2 },
        ],
      },
    },
  });
}

const BOARD_INCLUDE = {
  stages: {
    orderBy: { order: "asc" as const },
    include: {
      deals: {
        orderBy: { order: "asc" as const },
        include: {
          customer: { select: { name: true, externalId: true } },
          assignedTo: { select: { name: true } },
        },
      },
    },
  },
};

export async function getBoard(pipelineId?: string) {
  const def = await ensureDefaultPipeline();
  const id = pipelineId || def.id;
  const pipeline = await prisma.pipeline.findUnique({
    where: { id },
    include: BOARD_INCLUDE,
  });
  if (pipeline) return pipeline;
  return prisma.pipeline.findUnique({
    where: { id: def.id },
    include: BOARD_INCLUDE,
  });
}

export async function createDeal(input: {
  title: string;
  value?: number | null;
  stageId: string;
  customerId?: string | null;
  assignedToId?: string | null;
  note?: string | null;
}) {
  const stage = await prisma.stage.findUnique({ where: { id: input.stageId } });
  if (!stage) throw new Error("Stage tidak ditemukan");
  const count = await prisma.deal.count({ where: { stageId: input.stageId } });
  return prisma.deal.create({
    data: {
      pipelineId: stage.pipelineId,
      stageId: input.stageId,
      title: input.title,
      value: input.value ?? null,
      customerId: input.customerId ?? null,
      assignedToId: input.assignedToId ?? null,
      note: input.note ?? null,
      order: count,
    },
  });
}

export async function moveDeal(dealId: string, toStageId: string) {
  const stage = await prisma.stage.findUnique({ where: { id: toStageId } });
  if (!stage) throw new Error("Stage tidak ditemukan");
  const count = await prisma.deal.count({ where: { stageId: toStageId } });
  return prisma.deal.update({
    where: { id: dealId },
    data: { stageId: toStageId, order: count },
  });
}
