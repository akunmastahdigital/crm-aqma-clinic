import { prisma } from "@/lib/db";

// Push aktivitas chat CRM -> Konektor (opt-in via env KONEKTOR_API_KEY).
// Upsert lead by phone/id supaya Konektor tahu ada aktivitas chat + cuplikan terakhir.

const lastSync = new Map<string, number>(); // conversationId -> ms terakhir sync (throttle)
const THROTTLE_MS = 60_000; // maksimal 1 push per percakapan / menit

const digits = (s?: string | null) => (s ? s.replace(/\D/g, "") : "");

export async function pushChatActivity(input: {
  customerId: string;
  phone: string | null;
  name: string | null;
  konektorId?: string | null;
  conversationId: string;
  direction: "IN" | "OUT";
  text: string;
}) {
  const key = process.env.KONEKTOR_API_KEY;
  const phone = digits(input.phone);
  if (!key || !phone) return; // belum dikonfigurasi / tak ada nomor -> lewati

  // throttle per percakapan (getState: pakai runtime clock, aman di app)
  const now = Date.now();
  const last = lastSync.get(input.conversationId) || 0;
  if (now - last < THROTTLE_MS) return;
  lastSync.set(input.conversationId, now);
  if (lastSync.size > 5000) lastSync.clear(); // jaga memori

  const base = process.env.KONEKTOR_API_BASE || "https://konektor.id";
  const preview = (input.text || "[media]").replace(/\s+/g, " ").slice(0, 200);
  const arah = input.direction === "IN" ? "dari lead" : "dibalas agen";

  const body = {
    match: input.konektorId
      ? { by: "id", value: input.konektorId }
      : { by: "phone", value: phone },
    lead: {
      firstName: input.name?.trim() || "Lead WhatsApp",
      phone,
      source: "whatsapp",
      externalRef: `aqma-${input.customerId}`,
      notes: `Aktivitas chat Aqma CRM (${arah}): ${preview}`,
    },
    createIfMissing: true,
  };

  try {
    const r = await fetch(`${base}/api/v1/leads/upsert`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      console.error("konektor push non-ok:", r.status);
      return;
    }
    const d = await r.json().catch(() => ({}));
    const kid: string | undefined = d?.data?.id;
    // simpan konektorId ke customer supaya update berikutnya nyambung ke lead yang sama
    if (kid && !input.konektorId) {
      await prisma.customer
        .update({ where: { id: input.customerId }, data: { konektorId: kid } })
        .catch(() => {});
    }
  } catch (e) {
    console.error("konektor push error:", e);
  }
}
