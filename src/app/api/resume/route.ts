import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getAiSettings } from "@/lib/ai";
import { callBridge } from "@/lib/ai-bridge";
import { callCodexExec } from "@/lib/codex-exec";

export const dynamic = "force-dynamic";

const CACHE_HOURS = 6;

function periodRange(period: string): { from: Date; to: Date } {
  const now = new Date();
  const to = now;
  if (period === "today") {
    const from = new Date(now.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" }) + "T00:00:00+07:00");
    return { from, to };
  }
  const days = period === "30d" ? 30 : 7;
  const from = new Date(now.getTime() - days * 86_400_000);
  return { from, to };
}

// GET — ambil cache terakhir
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const channelId = sp.get("channelId") ?? null;
  const period = sp.get("period") ?? "7d";

  const history = await prisma.conversationResume.findMany({
    where: { channelId, period },
    orderBy: { generatedAt: "desc" },
    take: 50,
    select: { id: true, totalConvs: true, generatedAt: true, channelId: true, period: true, result: true },
  });

  return NextResponse.json({ history });
}

// POST — generate baru
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const channelId: string | null = body.channelId ?? null;
  const period: string = body.period ?? "7d";

  const { from, to } = periodRange(period);

  // Ambil conversations + messages dalam periode
  const conversations = await prisma.conversation.findMany({
    where: {
      createdAt: { gte: from, lte: to },
      ...(channelId ? { channelAccountId: channelId } : {}),
    },
    include: {
      customer: { select: { name: true, phone: true } },
      messages: {
        orderBy: { createdAt: "asc" },
        select: { direction: true, text: true, createdAt: true },
      },
    },
    orderBy: { createdAt: "desc" },
    // Batasi jumlah percakapan agar Codex exec tidak timeout
    take: period === "today" ? 50 : period === "7d" ? 80 : 120,
  });

  if (conversations.length === 0) {
    return NextResponse.json({ error: "Tidak ada percakapan dalam periode ini." }, { status: 422 });
  }

  // Bangun transkrip ringkas — batasi pesan per konversasi agar tidak terlalu panjang
  const transcript = conversations.map((conv, i) => {
    const lines = conv.messages
      .filter((m) => m.text?.trim())
      .slice(0, 20) // maks 20 pesan per konversasi
      .map((m) => `[${m.direction === "IN" ? "LEAD" : "AGEN"}] ${m.text!.trim().slice(0, 300)}`) // maks 300 karakter per pesan
      .join("\n");
    const name = conv.customer.name || conv.customer.phone || "Unknown";
    return `=== PERCAKAPAN ${i + 1} (${name}) ===\n${lines || "(tidak ada teks)"}`;
  }).join("\n\n");

  const periodLabel = period === "today" ? "hari ini" : period === "7d" ? "7 hari terakhir" : "30 hari terakhir";

  const prompt = `Kamu adalah analis bisnis yang berpengalaman. Analisis ${conversations.length} percakapan WhatsApp berikut dari periode ${periodLabel}.

PENTING: Balas HANYA dengan JSON valid tanpa teks lain, tanpa markdown code block.

Format JSON yang diinginkan:
{
  "pertanyaanSering": ["pertanyaan 1", "pertanyaan 2"],
  "requestUmum": ["request 1", "request 2"],
  "objeksiUmum": ["objeksi 1", "objeksi 2"],
  "produkDitanyakan": ["produk/paket A", "produk/paket B"],
  "kompetitor": ["nama kompetitor jika disebutkan"],
  "rangeBudget": ["range harga yang disebutkan lead"],
  "dropOffReasons": ["alasan lead menghilang / tidak jadi"],
  "leadMintaNanti": [{"nama": "nama/nomor lead", "alasan": "alasan mereka minta nanti"}],
  "tidakTerjawab": ["pertanyaan yang diulang lead karena belum terjawab baik"],
  "sentimen": {"positif": 0, "netral": 0, "negatif": 0},
  "polaPenting": ["pola atau insight penting lainnya"],
  "rekomendasiAction": ["aksi konkret untuk tim sales hari ini"]
}

Catatan:
- Jika tidak ada data untuk suatu kategori, isi array kosong []
- sentimen: jumlah percakapan (total harus = ${conversations.length})
- rekomendasiAction: maksimal 5, spesifik dan actionable
- Fokus pada pola yang berulang, bukan kasus satu-satu

TRANSKRIP PERCAKAPAN:
${transcript}`;

  // Panggil AI via Codex exec (non-interaktif, pakai ChatGPT Plus di server)
  // Fallback ke AI settings jika Codex gagal
  let rawResult: string;
  try {
    try {
      rawResult = await callCodexExec(prompt);
    } catch (codexErr) {
      // Fallback ke AI settings biasa jika Codex gagal
      console.error("[Resume AI] Codex exec failed, fallback:", codexErr);
      const aiSettings = await getAiSettings();
      if (aiSettings.bridgeEnabled) {
        rawResult = await callBridge(aiSettings, "", [], prompt);
      } else {
        const key = aiSettings.provider === "platform" ? process.env.AI_PLATFORM_KEY : aiSettings.apiKey;
        if (!key) throw new Error(`Codex exec gagal: ${String(codexErr)}. API key AI juga belum diatur.`);
        const base = (aiSettings.provider === "platform"
          ? process.env.AI_PLATFORM_BASE_URL
          : aiSettings.apiBaseUrl) || "https://api.openai.com/v1";
        const res = await fetch(base.replace(/\/$/, "") + "/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
          body: JSON.stringify({
            model: aiSettings.model,
            temperature: 0.3,
            messages: [{ role: "user", content: prompt }],
          }),
        });
        if (!res.ok) throw new Error(`AI error ${res.status}`);
        const data = await res.json();
        rawResult = (data.choices?.[0]?.message?.content ?? "").trim();
      }
    }
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }

  // Parse JSON dari respons AI
  let result: unknown;
  try {
    // Hapus markdown code block jika ada
    const cleaned = rawResult.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    result = JSON.parse(cleaned);
  } catch (parseErr) {
    console.error("[Resume AI] JSON parse error:", String(parseErr));
    console.error("[Resume AI] rawResult length:", rawResult?.length);
    console.error("[Resume AI] rawResult first 800:", rawResult?.slice(0, 800));
    console.error("[Resume AI] rawResult last 300:", rawResult?.slice(-300));
    return NextResponse.json({ error: "Respons AI tidak valid. Coba lagi." }, { status: 500 });
  }

  // Simpan sebagai entri baru — riwayat lama tetap ada
  const saved = await prisma.conversationResume.create({
    data: { channelId, period, totalConvs: conversations.length, result: result as object },
  });

  return NextResponse.json({ cached: saved, stale: false });
}
