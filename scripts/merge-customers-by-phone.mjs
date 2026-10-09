/**
 * Migration: merge Customer duplikat yang punya nomor HP sama lintas channel.
 * - Pilih customer "primer" = yang paling lama (createdAt paling kecil)
 * - Pindahkan semua relasi (conversations, deals, followUps, dll.) ke primer
 * - Hapus customer duplikat
 *
 * Jalankan sekali: node scripts/merge-customers-by-phone.mjs
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Temukan semua nomor HP yang dimiliki lebih dari 1 Customer
  const rows = await prisma.$queryRaw`
    SELECT phone, COUNT(*) AS cnt
    FROM customers
    WHERE phone IS NOT NULL AND phone <> ''
    GROUP BY phone
    HAVING COUNT(*) > 1
  `;

  console.log(`Ditemukan ${rows.length} nomor HP duplikat.`);
  if (rows.length === 0) { console.log("Tidak ada yang perlu di-merge."); return; }

  let merged = 0;
  for (const row of rows) {
    const phone = row.phone;
    const customers = await prisma.customer.findMany({
      where: { phone },
      orderBy: { createdAt: "asc" }, // yang paling lama = primer
    });
    if (customers.length < 2) continue;

    const primary = customers[0];
    const duplicates = customers.slice(1);

    console.log(`\nMerge nomor ${phone}:`);
    console.log(`  Primer  : ${primary.id} (${primary.channel}, created ${primary.createdAt.toISOString()})`);
    for (const dup of duplicates) {
      console.log(`  Duplikat: ${dup.id} (${dup.channel}, created ${dup.createdAt.toISOString()})`);
    }

    for (const dup of duplicates) {
      // Pindahkan semua relasi ke primary
      await prisma.conversation.updateMany({ where: { customerId: dup.id }, data: { customerId: primary.id } });
      await prisma.deal.updateMany({ where: { customerId: dup.id }, data: { customerId: primary.id } });
      await prisma.followUp.updateMany({ where: { customerId: dup.id }, data: { customerId: primary.id } });
      await prisma.salesJournal.updateMany({ where: { customerId: dup.id }, data: { customerId: primary.id } });
      await prisma.clickSession.updateMany({ where: { customerId: dup.id }, data: { customerId: primary.id } });
      await prisma.capiEvent.updateMany({ where: { customerId: dup.id }, data: { customerId: primary.id } });
      await prisma.leadTagItem.updateMany({ where: { customerId: dup.id }, data: { customerId: primary.id } });
      await prisma.audienceProfile.updateMany({ where: { customerId: dup.id }, data: { customerId: primary.id } });
      await prisma.webChatSession.updateMany({ where: { customerId: dup.id }, data: { customerId: primary.id } });

      // Salin data penting yang mungkin ada di duplikat tapi tidak di primer
      const updateData = {};
      if (!primary.name && dup.name) updateData.name = dup.name;
      if (!primary.email && dup.email) updateData.email = dup.email;
      if (!primary.note && dup.note) updateData.note = dup.note;
      if (!primary.konektorId && dup.konektorId) updateData.konektorId = dup.konektorId;
      if (Object.keys(updateData).length > 0) {
        await prisma.customer.update({ where: { id: primary.id }, data: updateData });
        Object.assign(primary, updateData);
      }

      // Hapus duplikat
      await prisma.customer.delete({ where: { id: dup.id } });
      console.log(`  ✓ Merged & deleted ${dup.id}`);
      merged++;
    }
  }

  console.log(`\nSelesai. Total ${merged} customer duplikat dihapus.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
