// Jalankan: node scripts/ig-backfill-names.mjs
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const GRAPH = "https://graph.facebook.com/v21.0";

async function getName(userId, token) {
  try {
    const res = await fetch(`${GRAPH}/${userId}?fields=name,username&access_token=${encodeURIComponent(token)}`);
    const data = await res.json();
    if (!res.ok) return null;
    return (data.name || data.username || null);
  } catch {
    return null;
  }
}

async function main() {
  const ch = await prisma.metaChannel.findFirst({
    where: { type: "INSTAGRAM", active: true },
  });
  if (!ch) { console.log("Tidak ada channel Instagram aktif"); process.exit(1); }

  const customers = await prisma.customer.findMany({
    where: { channel: "INSTAGRAM", OR: [{ name: null }, { name: "" }] },
    select: { id: true, externalId: true },
  });
  console.log(`Proses ${customers.length} customer IG tanpa nama...`);

  let updated = 0, failed = 0;
  for (let i = 0; i < customers.length; i++) {
    const c = customers[i];
    const name = await getName(c.externalId, ch.pageAccessToken);
    if (name) {
      await prisma.customer.update({ where: { id: c.id }, data: { name } });
      updated++;
      if (updated % 10 === 0) console.log(`  Updated: ${updated}, gagal: ${failed}, sisa: ${customers.length - i - 1}`);
    } else {
      failed++;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  console.log(`\nSelesai: ${updated} diupdate, ${failed} gagal dari ${customers.length} total`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
