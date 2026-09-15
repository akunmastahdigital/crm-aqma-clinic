import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Password awal WAJIB diisi lewat env, jangan di-hardcode di repo.
//   SEED_OWNER_PASSWORD=... SEED_AGENT_PASSWORD=... npm run db:seed
const OWNER_PASSWORD = process.env.SEED_OWNER_PASSWORD;
const AGENT_PASSWORD = process.env.SEED_AGENT_PASSWORD;

if (!OWNER_PASSWORD || !AGENT_PASSWORD) {
  console.error(
    "SEED_OWNER_PASSWORD dan SEED_AGENT_PASSWORD harus di-set sebelum seeding.",
  );
  process.exit(1);
}

const USERS = [
  {
    email: process.env.SEED_OWNER_EMAIL || "owner@klinikaqma.com",
    name: "Owner Aqma",
    role: "OWNER",
    password: OWNER_PASSWORD,
  },
  {
    email: process.env.SEED_AGENT_EMAIL || "cs@klinikaqma.com",
    name: "CS Aqma",
    role: "AGENT",
    password: AGENT_PASSWORD,
  },
];

// Tahapan default untuk klinik kecantikan: dari lead masuk sampai datang & repeat.
// Bisa diubah dari menu Pengaturan CRM setelah jalan.
const STAGES = [
  { name: "Lead Baru", color: "#6B7280" },
  { name: "Dihubungi", color: "#4A6483" },
  { name: "Konsultasi", color: "#C08A3E" },
  { name: "Booking Jadwal", color: "#A1A692" },
  { name: "Datang & Treatment", color: "#4F7A5B" },
  { name: "Batal / Tidak Jadi", color: "#B4534B" },
];

async function main() {
  for (const u of USERS) {
    const passwordHash = await bcrypt.hash(u.password, 10);
    await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, role: u.role },
      create: {
        email: u.email,
        name: u.name,
        role: u.role,
        passwordHash,
      },
    });
    console.log(`seeded ${u.role}: ${u.email}`);
  }

  // pipeline default
  const existing = await prisma.pipeline.findFirst({ where: { isDefault: true } });
  if (!existing) {
    await prisma.pipeline.create({
      data: {
        name: "Pipeline Pasien",
        isDefault: true,
        stages: { create: STAGES.map((s, i) => ({ name: s.name, color: s.color, order: i })) },
      },
    });
    console.log("seeded pipeline default + stages");
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
