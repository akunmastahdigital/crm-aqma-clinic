import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isReadOnly } from "@/lib/rbac";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// POST /api/customers/merge
// Body: { primaryId, secondaryId }
// Memindahkan semua relasi dari secondary ke primary, lalu hapus secondary.
// Semua dalam satu transaksi — kalau gagal, tidak ada yang berubah.
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Merge menghapus satu baris pasien secara permanen — role read-only dilarang.
  if (isReadOnly(session.role))
    return NextResponse.json({ error: "Akun ini hanya dapat melihat data." }, { status: 403 });

  const { primaryId, secondaryId } = (await req.json()) as { primaryId?: string; secondaryId?: string };
  if (!primaryId || !secondaryId) return NextResponse.json({ error: "primaryId dan secondaryId wajib diisi" }, { status: 400 });
  if (primaryId === secondaryId) return NextResponse.json({ error: "Tidak bisa merge dengan diri sendiri" }, { status: 400 });

  // Ambil kedua customer sebelum transaksi untuk validasi
  const [primary, secondary] = await Promise.all([
    prisma.customer.findUnique({ where: { id: primaryId } }),
    prisma.customer.findUnique({ where: { id: secondaryId } }),
  ]);
  if (!primary) return NextResponse.json({ error: "Customer primary tidak ditemukan" }, { status: 404 });
  if (!secondary) return NextResponse.json({ error: "Customer secondary tidak ditemukan" }, { status: 404 });

  try {
    await prisma.$transaction(async (tx) => {
      // 1. Conversations
      await tx.conversation.updateMany({ where: { customerId: secondaryId }, data: { customerId: primaryId } });

      // 2. Deals
      await tx.deal.updateMany({ where: { customerId: secondaryId }, data: { customerId: primaryId } });

      // 3. FollowUps
      await tx.followUp.updateMany({ where: { customerId: secondaryId }, data: { customerId: primaryId } });

      // 4. SalesJournals
      await tx.salesJournal.updateMany({ where: { customerId: secondaryId }, data: { customerId: primaryId } });

      // 5. ClickSessions
      await tx.clickSession.updateMany({ where: { customerId: secondaryId }, data: { customerId: primaryId } });

      // 6. CapiEvents
      await tx.capiEvent.updateMany({ where: { customerId: secondaryId }, data: { customerId: primaryId } });

      // 7. AudienceProfiles
      await tx.audienceProfile.updateMany({ where: { customerId: secondaryId }, data: { customerId: primaryId } });

      // 8. WebChatSessions
      await tx.webChatSession.updateMany({ where: { customerId: secondaryId }, data: { customerId: primaryId } });

      // 9. BroadcastRecipients
      await tx.broadcastRecipient.updateMany({ where: { customerId: secondaryId }, data: { customerId: primaryId } });

      // 10. LeadTagItems — ada unique constraint (tagId, customerId), hindari duplikat
      const [primaryTagItems, secondaryTagItems] = await Promise.all([
        tx.leadTagItem.findMany({ where: { customerId: primaryId }, select: { tagId: true } }),
        tx.leadTagItem.findMany({ where: { customerId: secondaryId }, select: { id: true, tagId: true } }),
      ]);
      const primaryTagIds = new Set(primaryTagItems.map((t) => t.tagId));
      for (const item of secondaryTagItems) {
        if (primaryTagIds.has(item.tagId)) {
          // Primary sudah punya tag ini — hapus duplikat dari secondary
          await tx.leadTagItem.delete({ where: { id: item.id } });
        } else {
          // Pindahkan ke primary
          await tx.leadTagItem.update({ where: { id: item.id }, data: { customerId: primaryId } });
        }
      }

      // 11. Merge tags array (union) dari Customer.tags
      const mergedTags = [...new Set([...(primary.tags ?? []), ...(secondary.tags ?? [])])];

      // Catatan digabung, plus satu baris jejak siapa yang melakukan merge.
      // Belum ada tabel audit, jadi jejaknya ditulis di note supaya tidak hilang
      // sama sekali — penggabungan ini menghapus satu baris pasien permanen.
      const auditLine =
        `[${new Date().toISOString()}] Digabung dari lead "${secondary.name ?? secondary.externalId}" ` +
        `(${secondary.channel}/${secondary.externalId}) oleh ${session.name}.`;
      const mergedNote = [primary.note, secondary.note, auditLine]
        .filter((x) => x && String(x).trim())
        .join("\n---\n");

      // 12. Update primary: merge tags + isi field kosong dari secondary.
      // Ambil tanggal closing paling AWAL, bukan sekadar yang tidak null —
      // kalau salah, laporan closing per bulan jadi meleset.
      const closedAt =
        primary.closedAt && secondary.closedAt
          ? (primary.closedAt < secondary.closedAt ? primary.closedAt : secondary.closedAt)
          : (primary.closedAt ?? secondary.closedAt);

      // konektorId punya unique constraint. Kalau nilainya dipindah ke primary
      // sementara baris secondary masih ada, transaksi gagal karena bentrok.
      // Jadi kosongkan dulu di secondary.
      if (!primary.konektorId && secondary.konektorId) {
        await tx.customer.update({
          where: { id: secondaryId },
          data: { konektorId: null },
        });
      }

      await tx.customer.update({
        where: { id: primaryId },
        data: {
          tags: mergedTags,
          note: mergedNote || null,
          // Isi field primary yang masih kosong dengan data secondary
          name: primary.name ?? secondary.name,
          phone: primary.phone ?? secondary.phone,
          email: primary.email ?? secondary.email,
          assignedToId: primary.assignedToId ?? secondary.assignedToId,
          score: Math.max(primary.score ?? 0, secondary.score ?? 0),
          source: primary.source ?? secondary.source,
          leadStatus: primary.leadStatus ?? secondary.leadStatus,
          priority: primary.priority ?? secondary.priority,
          konektorId: primary.konektorId ?? secondary.konektorId,
          lastContactAt:
            primary.lastContactAt && secondary.lastContactAt
              ? (primary.lastContactAt > secondary.lastContactAt ? primary.lastContactAt : secondary.lastContactAt)
              : (primary.lastContactAt ?? secondary.lastContactAt),
          closedAt,
          timeToCloseMinutes: primary.timeToCloseMinutes ?? secondary.timeToCloseMinutes,
          // Paket treatment yang diminati
          packageTypeId: primary.packageTypeId ?? secondary.packageTypeId,
          packageVariantId: primary.packageVariantId ?? secondary.packageVariantId,
          packageMonth: primary.packageMonth ?? secondary.packageMonth,
          packageYear: primary.packageYear ?? secondary.packageYear,
          potentialQty1x: primary.potentialQty1x ?? secondary.potentialQty1x,
          potentialQty3x: primary.potentialQty3x ?? secondary.potentialQty3x,
          potentialQty6x: primary.potentialQty6x ?? secondary.potentialQty6x,
          potentialQty12x: primary.potentialQty12x ?? secondary.potentialQty12x,
          potentialValue: primary.potentialValue ?? secondary.potentialValue,
        },
      });

      // 13. Hapus secondary (relasi yang tersisa akan di-cascade atau sudah dipindah)
      await tx.customer.delete({ where: { id: secondaryId } });
    }, { timeout: 30000 });

    return NextResponse.json({ ok: true, primaryId });
  } catch (e) {
    console.error("[merge] error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
