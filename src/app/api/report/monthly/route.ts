import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

type Msg = { direction: "IN" | "OUT"; text: string | null; createdAt: Date };

function clean(text: string | null | undefined): string {
  if (!text) return "";
  // Remove template placeholders, trim whitespace
  return text.replace(/\{\{[^}]+\}\}/g, "").replace(/\s+/g, " ").trim();
}

function extract(text: string, maxLen = 80): string {
  const c = clean(text);
  return c.length > maxLen ? c.slice(0, maxLen) + "…" : c;
}

// Kata kunci topik percakapan — disesuaikan untuk klinik kecantikan.
// Dipakai untuk menebak lead ini menanyakan apa, tanpa memanggil AI.
// Kalau daftar treatment Aqma sudah final, idealnya ini pindah ke Pengaturan CRM
// supaya bisa diubah tanpa deploy.
const TOPIC_PATTERNS: Array<[RegExp, string]> = [
  // Keluhan kulit
  [/\b(jerawat|acne|beruntusan|bruntusan)\b/i, "jerawat"],
  [/\b(bekas jerawat|bopeng|scar|acne scar)\b/i, "bekas jerawat / bopeng"],
  [/\b(flek|melasma|hiperpigmentasi|noda hitam)\b/i, "flek / pigmentasi"],
  [/\b(komedo|blackhead|whitehead)\b/i, "komedo"],
  [/\b(pori|pori-pori|poripori)\b/i, "pori besar"],
  [/\b(kusam|glowing|cerah|mencerahkan)\b/i, "mencerahkan kulit"],
  [/\b(kerut|keriput|anti.?aging|penuaan|kendur)\b/i, "anti-aging"],
  [/\b(kantung mata|mata panda|dark circle)\b/i, "area mata"],
  [/\b(sensitif|iritasi|kemerahan|rosacea)\b/i, "kulit sensitif"],
  // Treatment
  [/\b(facial|hydrafacial|hydra facial)\b/i, "facial"],
  [/\b(peeling|chemical peel)\b/i, "peeling"],
  [/\b(laser|co2|pico|picosecond)\b/i, "laser"],
  [/\b(botox|botulinum)\b/i, "botox"],
  [/\b(filler|hyaluronic)\b/i, "filler"],
  [/\b(tanam benang|thread ?lift|threadlift)\b/i, "tanam benang"],
  [/\b(microneedling|dermapen|micro ?needling)\b/i, "microneedling"],
  [/\b(infus|infus whitening|iv whitening|suntik putih)\b/i, "infus whitening"],
  [/\b(slimming|pelangsing|body ?contour|kurus)\b/i, "slimming / body"],
  [/\b(behel|veneer|gigi)\b/i, "pertanyaan gigi (bukan layanan kami)"],
  // Proses & administrasi
  [/\b(konsul|konsultasi|dokter)\b/i, "konsultasi dokter"],
  [/\b(reservasi|booking|jadwal|janji|slot)\b/i, "booking jadwal"],
  [/\b(promo|diskon|harga promo|paket)\b/i, "promo / harga"],
  [/\b(cicil|paylater|kredit|dp)\b/i, "cara pembayaran"],
  [/\b(lokasi|alamat|dimana|tempat|parkir)\b/i, "info lokasi"],
  [/\b(aman|efek samping|bahaya|bpom|izin)\b/i, "keamanan treatment"],
  [/\b(berapa kali|berapa sesi|hasilnya berapa lama)\b/i, "jumlah sesi / hasil"],
];

function detectTopics(messages: Msg[]): string[] {
  const allText = messages.map((m) => m.text ?? "").join(" ");
  const found: string[] = [];
  for (const [re, label] of TOPIC_PATTERNS) {
    if (re.test(allText) && !found.includes(label)) found.push(label);
  }
  return found.slice(0, 3);
}

function generateDescription(messages: Msg[], tags: string[], note: string | null): string {
  if (messages.length === 0) return "Tidak ada pesan dalam percakapan ini.";

  const inMsgs  = messages.filter((m) => m.direction === "IN");
  const outMsgs = messages.filter((m) => m.direction === "OUT");
  const firstIn = inMsgs[0];
  const lastIn  = inMsgs.at(-1);
  const lastOut = outMsgs.at(-1);
  const lastMsg = messages.at(-1);

  // Detect topics from all messages
  const topics = detectTopics(messages);

  const parts: string[] = [];

  // 1. What the customer opened with
  if (firstIn?.text) {
    const opener = extract(firstIn.text, 100);
    if (opener) parts.push(`Lead membuka percakapan: "${opener}"`);
  }

  // 2. Topic summary
  if (topics.length > 0) {
    parts.push(`Topik: ${topics.join(", ")}.`);
  }

  // 3. Engagement analysis
  if (inMsgs.length === 0) {
    parts.push("Tidak ada pesan masuk dari lead.");
  } else if (outMsgs.length === 0) {
    parts.push("Agent belum membalas percakapan ini.");
  } else {
    const ratio = inMsgs.length / outMsgs.length;
    if (inMsgs.length >= 5 && outMsgs.length >= 3) {
      parts.push(`Percakapan cukup aktif (${inMsgs.length} pesan masuk, ${outMsgs.length} pesan agen).`);
    } else if (inMsgs.length <= 2) {
      parts.push(`Respons lead sangat singkat (${inMsgs.length} pesan).`);
    } else {
      parts.push(`${inMsgs.length} pesan dari lead, ${outMsgs.length} balasan agen.`);
    }
    void ratio;
  }

  // 4. Check for location objection
  const allText = messages.map((m) => m.text ?? "").join(" ").toLowerCase();
  if (/kejauhan|jauh|terlalu jauh|jauh dari/.test(allText)) {
    parts.push("Lead menyampaikan keberatan jarak/lokasi kejauhan.");
  } else if (/harga|mahal|promo/.test(allText) && /mahal|kemahalan|duit|budget/.test(allText)) {
    parts.push("Ada indikasi keberatan harga dari lead.");
  } else if (/cicil|paylater|kredit|bisa dp/.test(allText)) {
    parts.push("Lead menanyakan opsi cicilan/pembayaran bertahap.");
  } else if (/efek samping|aman( ga| gak|\?)|bahaya|takut|ngeri/.test(allText)) {
    parts.push("Lead ragu soal keamanan/efek samping treatment — perlu diyakinkan dokter.");
  } else if (/tanya suami|tanya istri|diskusi dulu|izin dulu/.test(allText)) {
    parts.push("Keputusan tertahan di pihak lain (pasangan/keluarga).");
  }

  // 5. Where it stopped
  if (lastMsg) {
    if (lastMsg.direction === "IN" && lastIn?.text) {
      const lastInText = extract(lastIn.text, 80);
      if (/nanti|kapan-kapan|kabari|izin|cancel|batal|gak jadi/.test(allText)) {
        parts.push(`Lead minta waktu atau cancel — pesan terakhir lead: "${lastInText}".`);
      } else if (outMsgs.length > 0) {
        parts.push(`Chat berhenti setelah lead kirim pesan terakhir: "${lastInText}".`);
      }
    } else if (lastMsg.direction === "OUT" && lastOut?.text) {
      const lastOutText = extract(lastOut.text, 80);
      if (/follow.?up|template|kabar|menghubungi|info|halo|hai/i.test(lastOutText)) {
        parts.push(`Agent sudah kirim follow-up terakhir, lead tidak merespons.`);
      } else {
        parts.push(`Agent menunggu balasan lead — pesan agen terakhir: "${lastOutText}".`);
      }
    }
  }

  // 6. Use customer note if available
  if (note && clean(note).length > 10) {
    parts.push(`Catatan agen: ${clean(note).slice(0, 100)}.`);
  }

  return parts.join(" ") || "Tidak ada detail tambahan.";
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = new URL(req.url).searchParams;
  const now = new Date();
  const defaultFrom = new Date(now);
  defaultFrom.setDate(defaultFrom.getDate() - 30);

  const dateFrom = sp.get("from") ? new Date(sp.get("from")! + "T00:00:00+07:00") : defaultFrom;
  const dateTo   = sp.get("to")   ? new Date(sp.get("to")!   + "T23:59:59+07:00") : now;

  const conversations = await prisma.conversation.findMany({
    where: {
      createdAt: { gte: dateFrom, lte: dateTo },
      channel: { not: "SIMULATOR" },
    },
    include: {
      customer: {
        select: {
          id: true,
          name: true,
          phone: true,
          externalId: true,
          tags: true,
          closedAt: true,
          note: true,
        },
      },
      messages: {
        select: { direction: true, text: true, createdAt: true },
        orderBy: { createdAt: "asc" },
        // Limit to keep payload manageable — enough for description generation
        take: 30,
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const totalChats = conversations.length;
  let totalFollowUp = 0;

  type ConvRow = {
    id: string;
    createdAt: string;
    lastMessageAt: string | null;
    customerId: string;
    customerName: string | null;
    customerPhone: string | null;
    customerTags: string[];
    closedAt: string | null;
    messageCount: number;
    inboundCount: number;
    outboundCount: number;
    hasFollowUp: boolean;
    description: string;
  };

  type GroupData = {
    tag: string;
    count: number;
    conversations: ConvRow[];
  };

  const tagGroups: Record<string, ConvRow[]> = {};

  for (const conv of conversations) {
    const msgs = conv.messages as Msg[];
    const inbound  = msgs.filter((m) => m.direction === "IN");
    const outbound = msgs.filter((m) => m.direction === "OUT");
    const hasInbound  = inbound.length > 0;
    const hasOutbound = outbound.length > 0;
    if (hasInbound && hasOutbound) totalFollowUp++;

    const description = generateDescription(msgs, conv.customer.tags, conv.customer.note);

    const row: ConvRow = {
      id: conv.id,
      createdAt: conv.createdAt.toISOString(),
      lastMessageAt: conv.lastMessageAt?.toISOString() ?? null,
      customerId: conv.customer.id,
      customerName: conv.customer.name,
      customerPhone: conv.customer.phone ?? conv.customer.externalId,
      customerTags: conv.customer.tags,
      closedAt: conv.customer.closedAt?.toISOString() ?? null,
      messageCount: msgs.length,
      inboundCount: inbound.length,
      outboundCount: outbound.length,
      hasFollowUp: hasInbound && hasOutbound,
      description,
    };

    const tags = conv.customer.tags;
    if (tags.length === 0) {
      (tagGroups["Tanpa Label"] ??= []).push(row);
    } else {
      for (const tag of tags) {
        (tagGroups[tag] ??= []).push(row);
      }
    }
  }

  const groups: GroupData[] = Object.entries(tagGroups)
    .map(([tag, convs]) => ({ tag, count: convs.length, conversations: convs }))
    .sort((a, b) => b.count - a.count);

  return NextResponse.json({
    dateFrom: dateFrom.toISOString(),
    dateTo: dateTo.toISOString(),
    totalChats,
    totalFollowUp,
    groups,
  });
}
