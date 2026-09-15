import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { getAiSettings } from "@/lib/ai";
import { callBridge } from "@/lib/ai-bridge";

export const dynamic = "force-dynamic";

export type ConvRef = { id: string; customerName: string; phone: string; status: string | null };

const SYSTEM_PROMPT = `Kamu adalah evaluator profesional tim CS/sales WhatsApp untuk klinik kecantikan Aqma Aesthetic Clinic.
Tugasmu menganalisis percakapan antara agent dan calon pasien, lalu memberikan evaluasi mendalam yang actionable.

Konteks bisnis: klinik kecantikan yang menjual treatment (facial, laser, injeksi, perawatan tubuh)
baik satuan maupun paket beberapa sesi. Tujuan percakapan biasanya mengarah ke booking jadwal
konsultasi atau treatment, bukan sekadar closing satu kali.

Hal yang penting dinilai: kecepatan respon, kemampuan menggali keluhan/kondisi kulit pasien,
ketepatan merekomendasikan treatment, cara menjawab keberatan harga, apakah agent mengarahkan
ke booking jadwal, dan apakah ada follow up untuk pasien repeat.
JANGAN memberi saran medis atau menjanjikan hasil treatment — itu wewenang dokter.

Format evaluasimu WAJIB menggunakan markdown dengan heading (##, ###), bullet points (-), dan tabel jika diperlukan.
Tulis dalam Bahasa Indonesia yang ringkas dan langsung ke poin.
PENTING: Saat menyebut percakapan, gunakan nama customer langsung (contoh: "percakapan dengan Budi Santoso"), bukan "Percakapan 1" atau nomor urut.`;

function buildTranscript(
  messages: { direction: string; text: string | null; authorName: string | null; createdAt: Date }[]
): string {
  return messages
    .filter((m) => m.text)
    .map((m) => {
      const time = m.createdAt.toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "short", timeStyle: "short" });
      const label = m.direction === "IN" ? `[Lead]` : `[Agent${m.authorName ? " - " + m.authorName : ""}]`;
      return `${time} ${label}: ${m.text}`;
    })
    .join("\n");
}

// ── Scope: satu percakapan ─────────────────────────────────────────────────
async function evaluateConversation(conversationId: string): Promise<{ result: string; refs: ConvRef[] }> {
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      customer: { select: { name: true, phone: true, tags: true, leadStatus: true } },
      messages: {
        orderBy: { createdAt: "asc" },
        take: 80,
        select: { direction: true, text: true, createdAt: true, author: { select: { name: true } } },
      },
    },
  });

  if (!conv) throw new Error("Percakapan tidak ditemukan");
  if (!conv.messages.length) throw new Error("Percakapan belum memiliki pesan");

  const customerName = conv.customer?.name ?? conv.customer?.phone ?? "Unknown";
  const transcript = buildTranscript(
    conv.messages.map((m) => ({ ...m, authorName: m.author?.name ?? null }))
  );

  const prompt = `Customer: ${customerName} | Status: ${conv.customer?.leadStatus ?? "-"} | Label: ${(conv.customer?.tags as string[] ?? []).join(", ") || "-"}

TRANSCRIPT PERCAKAPAN (dengan ${customerName}):
${transcript}

Berikan evaluasi lengkap:

## Ringkasan Percakapan
(2-3 kalimat ringkas tentang percakapan ini)

## Skor Performa Agent (1–10)
- Kecepatan & konsistensi respons: ?/10
- Kualitas & kejelasan informasi: ?/10
- Penanganan keberatan: ?/10
- Teknik closing & follow-up: ?/10
- Empati & profesionalisme: ?/10
- **Total: ?/50**

## Momen Kritis
(Titik yang menentukan arah lead — dimanfaatkan atau terlewat — kutip kalimat spesifik)

## Analisis Kegagalan / Hambatan Closing
(Jika belum closing — penyebab spesifik, kutip kalimat dari transcript)

## Rekomendasi Follow-Up
(Langkah konkret yang harus dilakukan agent selanjutnya untuk ${customerName})

## Tips Perbaikan untuk Agent
(3–5 saran spesifik berbasis percakapan ini)`;

  const settings = await getAiSettings();
  const result = await callBridge(settings, SYSTEM_PROMPT, [], prompt);
  const refs: ConvRef[] = [{
    id: conversationId,
    customerName,
    phone: conv.customer?.phone ?? "",
    status: conv.customer?.leadStatus ?? null,
  }];
  return { result, refs };
}

// ── Scope: per agent ────────────────────────────────────────────────────────
async function evaluateAgent(agentId: string, startDate: Date, endDate: Date): Promise<{ result: string; refs: ConvRef[] }> {
  const agent = await prisma.user.findUnique({ where: { id: agentId }, select: { name: true } });
  if (!agent) throw new Error("Agent tidak ditemukan");

  const convAgents = await prisma.conversationAgent.findMany({
    where: { agentId, joinedAt: { gte: startDate, lte: endDate } },
    include: {
      conversation: {
        include: {
          customer: { select: { name: true, phone: true, leadStatus: true, tags: true } },
          messages: {
            orderBy: { createdAt: "asc" },
            take: 40,
            select: { direction: true, text: true, createdAt: true, author: { select: { name: true } } },
          },
        },
      },
    },
    take: 25,
  });

  if (!convAgents.length) throw new Error("Tidak ada percakapan ditemukan untuk agent ini dalam rentang waktu yang dipilih");

  const refs: ConvRef[] = convAgents
    .filter((ca) => ca.conversation.messages.length > 0)
    .map((ca) => ({
      id: ca.conversationId,
      customerName: ca.conversation.customer?.name ?? ca.conversation.customer?.phone ?? "Unknown",
      phone: ca.conversation.customer?.phone ?? "",
      status: ca.conversation.customer?.leadStatus ?? null,
    }));

  const summaries = convAgents
    .filter((ca) => ca.conversation.messages.length > 0)
    .map((ca) => {
      const conv = ca.conversation;
      const name = conv.customer?.name ?? conv.customer?.phone ?? "Unknown";
      const transcript = buildTranscript(
        conv.messages.slice(0, 20).map((m) => ({ ...m, authorName: m.author?.name ?? null }))
      );
      const status = conv.customer?.leadStatus ?? "-";
      return `--- [${name}] | Status: ${status} ---\n${transcript}`;
    })
    .join("\n\n");

  const prompt = `EVALUASI PERFORMA AGENT: ${agent.name}
Periode: ${startDate.toLocaleDateString("id-ID")} - ${endDate.toLocaleDateString("id-ID")}
Total percakapan dianalisis: ${refs.length}

PERCAKAPAN (label berdasarkan nama customer):
${summaries}

Berikan laporan evaluasi. PENTING: Saat memberi contoh, sebut nama customer langsung (bukan "Percakapan 1").

## Profil Performa ${agent.name}

### Skor Rata-Rata (1–10)
- Konsistensi respons & follow-up: ?/10
- Kualitas komunikasi & informasi: ?/10
- Kemampuan handling keberatan: ?/10
- Teknik closing: ?/10
- Profesionalisme: ?/10
- **Total: ?/50**

### Conversion Summary
- Total lead ditangani: ${refs.length}
- Estimasi yang closing: ?
- Estimasi yang belum/tidak closing: ?

## Pola Kekuatan
(Yang konsisten dilakukan dengan baik — sebut nama customer sebagai contoh)

## Pola Kelemahan
(Yang berulang kali kurang optimal — sebut nama customer sebagai contoh spesifik)

## Penyebab Utama Kegagalan Closing
(Hambatan terbesar berdasarkan percakapan — berikan contoh dengan nama customer)

## Rencana Coaching
(5 poin konkret yang perlu dilatih/diperbaiki untuk ${agent.name})

## Catatan untuk Supervisor
(Rekomendasi cara membimbing ${agent.name})`;

  const settings = await getAiSettings();
  const result = await callBridge(settings, SYSTEM_PROMPT, [], prompt);
  return { result, refs };
}

// ── Scope: seluruh tim ──────────────────────────────────────────────────────
async function evaluateTeam(startDate: Date, endDate: Date): Promise<{ result: string; refs: ConvRef[] }> {
  const agents = await prisma.user.findMany({
    where: { role: { in: ["AGENT", "SUPERADMIN"] } },
    select: { id: true, name: true },
  });

  const allRefs: ConvRef[] = [];

  const agentStats = await Promise.all(
    agents.map(async (agent) => {
      const convAgents = await prisma.conversationAgent.findMany({
        where: { agentId: agent.id, joinedAt: { gte: startDate, lte: endDate } },
        include: {
          conversation: {
            include: {
              customer: { select: { name: true, phone: true, leadStatus: true, closedAt: true } },
              messages: {
                take: 10,
                orderBy: { createdAt: "asc" },
                select: { direction: true, text: true, createdAt: true },
              },
            },
          },
        },
        take: 15,
      });

      const closedCount = convAgents.filter(
        (ca) => ca.conversation.customer?.leadStatus?.toLowerCase().includes("closing") ||
          ca.conversation.customer?.closedAt != null
      ).length;

      convAgents
        .filter((ca) => ca.conversation.messages.length > 0)
        .forEach((ca) => {
          const name = ca.conversation.customer?.name ?? ca.conversation.customer?.phone ?? "Unknown";
          if (!allRefs.find((r) => r.id === ca.conversationId)) {
            allRefs.push({
              id: ca.conversationId,
              customerName: name,
              phone: ca.conversation.customer?.phone ?? "",
              status: ca.conversation.customer?.leadStatus ?? null,
            });
          }
        });

      const sampleTranscripts = convAgents
        .filter((ca) => ca.conversation.messages.length > 0)
        .slice(0, 5)
        .map((ca) => {
          const name = ca.conversation.customer?.name ?? ca.conversation.customer?.phone ?? "?";
          const msgs = ca.conversation.messages
            .filter((m) => m.text)
            .slice(0, 8)
            .map((m) => `${m.direction === "IN" ? "[Lead]" : "[Agent]"}: ${m.text}`)
            .join(" | ");
          return `[${name}] (status: ${ca.conversation.customer?.leadStatus ?? "-"}): ${msgs}`;
        })
        .join("\n");

      return { name: agent.name, total: convAgents.length, closed: closedCount, sampleTranscripts };
    })
  );

  const conversionRate = (a: { total: number; closed: number }) =>
    a.total ? Math.round((a.closed / a.total) * 100) : 0;

  const teamOverview = agentStats
    .map((a) => `- ${a.name}: ${a.total} lead | ${a.closed} closing | ${conversionRate(a)}% conversion\nSample percakapan:\n${a.sampleTranscripts}`)
    .join("\n\n");

  const prompt = `EVALUASI TIM SALES AQMA CLINIC
Periode: ${startDate.toLocaleDateString("id-ID")} - ${endDate.toLocaleDateString("id-ID")}
Total agent: ${agents.length}

DATA PER AGENT:
${teamOverview}

PENTING: Saat memberi contoh, sebut nama customer langsung, bukan nomor urut.

## Ringkasan Eksekutif Tim
(Gambaran umum kondisi tim dalam periode ini — 3-4 kalimat)

## Tabel Performa Agent
| Agent | Total Lead | Closing | Conversion | Rating |
|-------|-----------|---------|-----------|--------|
${agentStats.map((a) => `| ${a.name} | ${a.total} | ${a.closed} | ${conversionRate(a)}% | ? |`).join("\n")}

## Ranking Performa
(Urutkan dari terbaik — berikan alasan singkat per agent)

## Pola Kelemahan Umum Tim
(Masalah berulang di banyak agent — ini prioritas coaching, sertakan contoh nama customer)

## Pola Kekuatan Tim
(Yang sudah bagus — pertahankan dan replikasikan)

## Analisis Hambatan Closing Terbesar
(Kenapa lead tidak closing? Berikan contoh percakapan spesifik dengan nama customer)

## Rekomendasi Strategis untuk Owner
(5 langkah konkret untuk meningkatkan performa tim)

## Agenda Coaching Bulan Ini
(Topik yang perlu dibahas dalam sesi coaching berikutnya)`;

  const settings = await getAiSettings();
  const result = await callBridge(settings, SYSTEM_PROMPT, [], prompt);
  return { result, refs: allRefs };
}

// ── Scope: analisis lead (potensi closing vs risiko gagal) ─────────────────
async function evaluateLeads(startDate: Date, endDate: Date): Promise<{ result: string; refs: ConvRef[] }> {
  // Ambil percakapan aktif dalam rentang tanggal, max 10 lead (jaga prompt tetap kecil)
  const conversations = await prisma.conversation.findMany({
    where: { lastMessageAt: { gte: startDate, lte: endDate } },
    orderBy: { lastMessageAt: "desc" },
    take: 10,
    include: {
      customer: { select: { name: true, phone: true, leadStatus: true, tags: true } },
      messages: {
        orderBy: { createdAt: "asc" },
        take: 10,
        select: { direction: true, text: true, createdAt: true, author: { select: { name: true } } },
      },
    },
  });

  if (!conversations.length) throw new Error("Tidak ada percakapan ditemukan dalam rentang waktu yang dipilih");

  const refs: ConvRef[] = conversations
    .filter((c) => c.messages.length > 0)
    .map((c) => ({
      id: c.id,
      customerName: c.customer?.name ?? c.customer?.phone ?? "Unknown",
      phone: c.customer?.phone ?? "",
      status: c.customer?.leadStatus ?? null,
    }));

  const leadSummaries = conversations
    .filter((c) => c.messages.length > 0)
    .map((c) => {
      const name = c.customer?.name ?? c.customer?.phone ?? "Unknown";
      const status = c.customer?.leadStatus ?? "-";
      const tags = (c.customer?.tags as string[] ?? []).join(", ") || "-";
      const transcript = buildTranscript(
        c.messages.map((m) => ({ ...m, authorName: m.author?.name ?? null }))
      );
      return `=== ${name} | Status: ${status} | Label: ${tags} ===\n${transcript}`;
    })
    .join("\n\n");

  const prompt = `ANALISIS POTENSI LEAD - AQMA CLINIC
Periode: ${startDate.toLocaleDateString("id-ID")} - ${endDate.toLocaleDateString("id-ID")}
Total lead dianalisis: ${refs.length} (sample terbaru, max 10)

DATA PERCAKAPAN PER LEAD:
${leadSummaries}

Analisis setiap lead di atas dan kelompokkan ke dalam dua kategori. Gunakan nama customer langsung, bukan nomor urut.

## 🟢 Lead Berpotensi Closing

Untuk setiap lead yang kamu nilai berpotensi closing, tulis:

### [Nama Lead]
- **Alasan berpotensi closing:** (sinyal positif dari percakapan — ketertarikan, pertanyaan teknis, kesediaan budget, dll)
- **Langkah selanjutnya:**
  1. (aksi pertama yang harus dilakukan agent)
  2. (aksi kedua)
  3. (aksi ketiga jika perlu)
- **Urgensi:** Tinggi / Sedang / Rendah

---

## 🔴 Lead Berpotensi Gagal Closing

Untuk setiap lead yang kamu nilai berisiko gagal, tulis:

### [Nama Lead]
- **Penyebab risiko gagal:** (sinyal negatif — tidak responsif, keberatan harga, ragu-ragu, dll — kutip kalimat spesifik jika ada)
- **Cara mencegah gagal closing:**
  1. (langkah pertama)
  2. (langkah kedua)
  3. (langkah ketiga jika perlu)
- **Tingkat risiko:** Tinggi / Sedang / Rendah

---

## 📊 Ringkasan
- Total berpotensi closing: ?
- Total berisiko gagal: ?
- Rekomendasi prioritas follow-up: (sebutkan 3 nama lead yang paling mendesak ditangani)`;

  const settings = await getAiSettings();
  // Timeout 100 detik — cegah hang lebih lama dari nginx proxy_read_timeout 120s
  const result = await Promise.race([
    callBridge(settings, SYSTEM_PROMPT, [], prompt),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Analisis AI timeout (>100 detik). Kurangi rentang tanggal atau coba lagi.")), 100_000),
    ),
  ]);
  return { result, refs };
}

// ── GET: ambil riwayat evaluasi ─────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (session.role === "GUEST" || !can(session.role, "manage_owner")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const scope = sp.get("scope") ?? undefined;

  const histories = await prisma.evaluationHistory.findMany({
    where: scope ? { scope } : undefined,
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true, scope: true, agentName: true, startDate: true, endDate: true,
      convCount: true, createdAt: true, refs: true, result: true,
    },
  });

  return NextResponse.json({ histories });
}

// ── POST: generate + simpan ─────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (session.role === "GUEST" || !can(session.role, "manage_owner")) {
    return NextResponse.json({ error: "Fitur ini hanya tersedia untuk Owner" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { scope, conversationId, agentId, startDate, endDate } = body as {
      scope: "conversation" | "agent" | "team" | "leads";
      conversationId?: string;
      agentId?: string;
      startDate?: string;
      endDate?: string;
    };

    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 86_400_000);
    const end = endDate ? new Date(endDate + "T23:59:59") : new Date();

    let data: { result: string; refs: ConvRef[] };
    let agentName: string | null = null;

    if (scope === "conversation") {
      if (!conversationId) return NextResponse.json({ error: "conversationId wajib" }, { status: 400 });
      data = await evaluateConversation(conversationId);
      agentName = data.refs[0]?.customerName ?? null;
    } else if (scope === "agent") {
      if (!agentId) return NextResponse.json({ error: "agentId wajib" }, { status: 400 });
      data = await evaluateAgent(agentId, start, end);
      const agent = await prisma.user.findUnique({ where: { id: agentId }, select: { name: true } });
      agentName = agent?.name ?? null;
    } else if (scope === "team") {
      data = await evaluateTeam(start, end);
    } else if (scope === "leads") {
      data = await evaluateLeads(start, end);
    } else {
      return NextResponse.json({ error: "scope tidak valid" }, { status: 400 });
    }

    // Simpan ke history
    const saved = await prisma.evaluationHistory.create({
      data: {
        scope,
        agentId: scope === "agent" ? agentId : null,
        agentName,
        startDate: scope !== "conversation" ? start : null,
        endDate: scope !== "conversation" ? end : null,
        convCount: data.refs.length,
        result: data.result,
        refs: data.refs as object[],
        createdBy: session.uid,
      },
    });

    return NextResponse.json({ ...data, historyId: saved.id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Terjadi kesalahan";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ── DELETE: hapus satu history ──────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (session.role === "GUEST" || !can(session.role, "manage_owner")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id wajib" }, { status: 400 });
  await prisma.evaluationHistory.delete({ where: { id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
