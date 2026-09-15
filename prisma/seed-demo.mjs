// SEED DEMO — data contoh saja, JANGAN dijalankan di database produksi.
// Semua nama & nomor di sini fiktif. Dipisah dari seed.mjs supaya data demo
// tidak pernah tercampur dengan data pasien asli.
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const HOUR = 3_600_000;
const now = Date.now();

const DEMO = [
  { ext: "6281234000101", name: "Rina Amelia", tags: ["LEAD", "FACIAL"], winH: 22, lastMin: 7, unread: 2, msg: "Kak, facial buat kulit berjerawat harganya berapa ya?" },
  { ext: "6281234000102", name: "Dewi Anggraini", tags: ["PROSPEK", "LASER"], winH: 20, lastMin: 39, unread: 0, msg: "Kalau laser flek hitam perlu berapa kali sesi?" },
  { ext: "6281234000103", name: "Siti Nurhaliza", tags: ["PROSPEK", "HOT"], winH: 5, lastMin: 120, unread: 1, msg: "Bisa booking hari Sabtu pagi?" },
  { ext: "6281234000104", name: "Putri Maharani", tags: ["LEAD"], winH: -3, lastMin: 1500, unread: 0, msg: "Nanti saya kabari lagi ya kak" },
  { ext: "6281234000105", name: "Ayu Lestari", tags: ["PASIEN LAMA"], winH: 23, lastMin: 3, unread: 4, msg: "Mau lanjut sesi ke-3 paket laser saya" },
  { ext: "6281234000106", name: "Maya Sari", tags: ["PROSPEK"], winH: 12, lastMin: 60, unread: 0, msg: "Oke kak, saya ambil paket 6x ya" },
];

async function main() {
  const agent = await prisma.user.findUnique({
    where: { email: process.env.SEED_AGENT_EMAIL || "cs@klinikaqma.com" },
  });

  for (const [i, d] of DEMO.entries()) {
    const lastContactAt = new Date(now - d.lastMin * 60_000);
    const windowExpiresAt = new Date(now + d.winH * HOUR);

    const customer = await prisma.customer.upsert({
      where: { channel_externalId: { channel: "SIMULATOR", externalId: d.ext } },
      update: { name: d.name, tags: d.tags, windowExpiresAt, lastContactAt },
      create: {
        channel: "SIMULATOR",
        externalId: d.ext,
        name: d.name,
        phone: d.ext,
        tags: d.tags,
        windowExpiresAt,
        lastContactAt,
        assignedToId: i % 2 === 0 ? agent?.id ?? null : null,
      },
    });

    // satu percakapan per customer (skip kalau sudah ada)
    let conv = await prisma.conversation.findFirst({ where: { customerId: customer.id } });
    if (!conv) {
      conv = await prisma.conversation.create({
        data: {
          customerId: customer.id,
          channel: "SIMULATOR",
          status: "OPEN",
          unread: d.unread,
          lastMessageAt: lastContactAt,
          lastMessageText: d.msg,
          assignedToId: customer.assignedToId,
        },
      });
      await prisma.message.createMany({
        data: [
          { conversationId: conv.id, direction: "IN", text: "Halo", createdAt: new Date(lastContactAt.getTime() - 120000) },
          { conversationId: conv.id, direction: "OUT", text: "Halo Kak, selamat datang di Aqma Aesthetic Clinic. Ada yang bisa kami bantu?", createdAt: new Date(lastContactAt.getTime() - 60000), authorId: agent?.id ?? null },
          { conversationId: conv.id, direction: "IN", text: d.msg, createdAt: lastContactAt },
        ],
      });
    }
    console.log("demo:", d.name);
  }

  // deal contoh (kalau board masih kosong)
  const pipeline = await prisma.pipeline.findFirst({
    where: { isDefault: true },
    include: { stages: { orderBy: { order: "asc" } } },
  });
  const dealCount = pipeline ? await prisma.deal.count({ where: { pipelineId: pipeline.id } }) : 0;
  if (pipeline && dealCount === 0) {
    const stageByName = Object.fromEntries(pipeline.stages.map((s) => [s.name, s.id]));
    const custByName = Object.fromEntries(
      (await prisma.customer.findMany()).map((c) => [c.name, c.id]),
    );
    const DEALS = [
      { title: "Paket Facial Acne 6x - Rina Amelia", value: 1800000, stage: "Konsultasi", cust: "Rina Amelia" },
      { title: "Laser Flek 3x - Dewi Anggraini", value: 2850000, stage: "Dihubungi", cust: "Dewi Anggraini" },
      { title: "Booking Konsultasi - Siti Nurhaliza", value: 150000, stage: "Booking Jadwal", cust: "Siti Nurhaliza" },
      { title: "Paket Laser 6x - Ayu Lestari", value: 4200000, stage: "Datang & Treatment", cust: "Ayu Lestari" },
      { title: "Facial Glow 1x - Putri Maharani", value: 350000, stage: "Lead Baru", cust: "Putri Maharani" },
    ];
    for (const [i, dd] of DEALS.entries()) {
      const stageId = stageByName[dd.stage];
      if (!stageId) { console.warn("stage tidak ada, dilewati:", dd.stage); continue; }
      await prisma.deal.create({
        data: {
          pipelineId: pipeline.id,
          stageId,
          title: dd.title,
          value: dd.value,
          customerId: custByName[dd.cust] ?? null,
          order: i,
        },
      });
    }
    console.log("seeded demo deals");
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
