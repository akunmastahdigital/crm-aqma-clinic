import { prisma } from "@/lib/db";
import { fetchWabaTemplates } from "@/lib/waba";

// Tarik template dari Meta untuk semua WABA yang tersambung.
export async function syncTemplates() {
  const channels = await prisma.wabaChannel.findMany({ where: { active: true } });
  const seen = new Set<string>();
  let count = 0;

  for (const ch of channels) {
    if (seen.has(ch.wabaId)) continue; // template per-WABA (bukan per-nomor)
    seen.add(ch.wabaId);
    const tpls = await fetchWabaTemplates(ch.wabaId, ch.accessToken);

    for (const t of tpls) {
      const body = (t.components ?? []).find((c) => c.type === "BODY")?.text ?? null;
      await prisma.template.upsert({
        where: {
          wabaId_name_language: { wabaId: ch.wabaId, name: t.name, language: t.language },
        },
        update: {
          metaId: t.id,
          category: t.category,
          status: t.status,
          bodyText: body,
          components: t.components ?? undefined,
        },
        create: {
          wabaId: ch.wabaId,
          metaId: t.id,
          name: t.name,
          language: t.language,
          category: t.category,
          status: t.status,
          bodyText: body,
          components: t.components ?? undefined,
        },
      });
      count++;
    }

    // Hapus template lokal yang sudah tidak ada di Meta
    const activeMetaIds = tpls.map((t) => t.id).filter(Boolean);
    if (activeMetaIds.length > 0) {
      await prisma.template.deleteMany({
        where: {
          wabaId: ch.wabaId,
          metaId: { not: null, notIn: activeMetaIds },
        },
      });
    }
  }
  return count;
}
