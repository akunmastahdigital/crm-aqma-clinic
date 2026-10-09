import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { callClaudeBridge } from "@/lib/ai-bridge";

export const dynamic = "force-dynamic";

// GET — ambil semua profil (history) untuk satu customer
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;

  const profiles = await prisma.audienceProfile.findMany({
    where: { customerId: id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ profiles });
}

// POST — generate profil baru via AI dan simpan
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;

  // Ambil data customer + percakapan
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      packageType:    { select: { name: true } },
      packageVariant: { select: { name: true } },
      assignedTo:     { select: { name: true } },
      conversations: {
        orderBy: { updatedAt: "desc" },
        take: 1,
        include: {
          messages: {
            orderBy: { createdAt: "asc" },
            select: { direction: true, text: true, createdAt: true, author: { select: { name: true } } },
          },
        },
      },
    },
  });

  if (!customer) return NextResponse.json({ error: "Customer tidak ditemukan" }, { status: 404 });

  // Susun konteks untuk AI
  const customerCtx = [
    `Nama: ${customer.name ?? "(belum diisi)"}`,
    `Nomor WA: ${customer.externalId}`,
    `Tag: ${customer.tags.join(", ") || "belum ada"}`,
    customer.note ? `Catatan internal: ${customer.note}` : null,
    customer.packageType ? `Minat paket: ${customer.packageType.name}${customer.packageVariant ? " – " + customer.packageVariant.name : ""}` : null,
    customer.packageMonth && customer.packageYear ? `Target bulan treatment: ${customer.packageMonth}/${customer.packageYear}` : null,
    customer.potentialValue ? `Estimasi nilai: Rp ${customer.potentialValue.toLocaleString("id-ID")}` : null,
    customer.assignedTo ? `Agent: ${customer.assignedTo.name}` : null,
  ].filter(Boolean).join("\n");

  const conv = customer.conversations[0];
  const chatLines = conv?.messages
    .filter((m) => m.text?.trim())
    .slice(-80) // maks 80 pesan terakhir
    .map((m) => {
      const who = m.direction === "INBOUND" ? "Lead" : (m.author?.name ?? "CS");
      return `${who}: ${m.text}`;
    }).join("\n") ?? "(belum ada percakapan)";

  const systemPrompt = `Kamu adalah analis CRM untuk klinik kecantikan bernama Aqma Aesthetic Clinic. Tugasmu adalah membuat profil audience secara mendalam dan akurat berdasarkan data pasien/lead dan riwayat percakapan WhatsApp yang diberikan.

JANGAN memberi diagnosa, saran medis, atau menjanjikan hasil treatment. Fokus hanya pada profil perilaku, motivasi, dan preferensi untuk keperluan komunikasi tim CS/sales.

PENTING: Balas HANYA dengan satu blok JSON yang valid. Tidak ada teks lain di luar JSON. Jika data tidak cukup untuk menyimpulkan sesuatu, isi dengan "Belum dapat disimpulkan".`;

  const userMessage = `Data pelanggan:
${customerCtx}

Riwayat percakapan:
${chatLines}

Buat profil audience dalam format JSON berikut (isi semua field, bahasa Indonesia):

{
  "karakter": {
    "tipe": "satu dari: Detail-oriented / Impulsif / Ragu-ragu / Price-sensitive / Emosional / Pragmatis",
    "deskripsi": "penjelasan singkat karakter berdasarkan cara komunikasi mereka"
  },
  "motivasi": {
    "alasan_utama": "keluhan atau tujuan estetik utama mereka, mis. jerawat, flek, penuaan, ingin lebih cerah",
    "urgensi": "satu dari: Ingin segera / Dalam bulan ini / Beberapa bulan lagi / Masih cari-cari info",
    "deskripsi": "penjelasan motivasi dan urgensi"
  },
  "profil_pasien": {
    "pengalaman": "satu dari: Baru pertama kali treatment / Pernah di klinik lain / Pasien lama Aqma / Belum jelas",
    "estimasi_usia": "perkiraan usia atau rentang usia",
    "domisili": "kota/daerah jika bisa disimpulkan, atau 'Tidak diketahui'"
  },
  "kesiapan_finansial": {
    "level": "satu dari: Sudah siap / Sedang menabung / Perlu cicilan / Belum jelas",
    "preferensi_paket": "satu dari: Coba satuan dulu / Paket beberapa sesi / Premium / Belum jelas",
    "deskripsi": "penjelasan kesiapan finansial"
  },
  "pengambilan_keputusan": {
    "pengambil": "satu dari: Diri sendiri / Pasangan / Keluarga besar / Belum jelas",
    "faktor_utama": ["faktor 1", "faktor 2"],
    "deskripsi": "penjelasan pola pengambilan keputusan"
  },
  "keberatan": {
    "poin": ["keberatan 1", "keberatan 2"],
    "deskripsi": "penjelasan keberatan utama yang perlu diatasi"
  },
  "kesiapan_closing": {
    "level": "satu dari: Cold / Warm / Hot",
    "skor": 5,
    "alasan": "alasan singkat penilaian ini"
  },
  "rekomendasi": {
    "pendekatan": "cara terbaik agent berkomunikasi dengan lead ini",
    "hindari": "apa yang sebaiknya tidak dilakukan",
    "waktu_follow_up": "kapan dan seberapa sering follow up disarankan",
    "catatan_tambahan": "insight lain yang relevan untuk agent"
  }
}`;

  let raw: string;
  try {
    raw = await callClaudeBridge(systemPrompt, [], userMessage);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Gagal generate profil: ${msg}` }, { status: 500 });
  }

  // Ekstrak JSON dari respons (claude kadang tambah backticks)
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return NextResponse.json({ error: "AI tidak mengembalikan JSON yang valid", raw }, { status: 500 });
  }

  let content: unknown;
  try {
    content = JSON.parse(jsonMatch[0]);
  } catch {
    return NextResponse.json({ error: "Gagal parsing JSON dari AI", raw: jsonMatch[0] }, { status: 500 });
  }

  const profile = await prisma.audienceProfile.create({
    data: { customerId: id, content },
  });

  return NextResponse.json({ profile });
}
