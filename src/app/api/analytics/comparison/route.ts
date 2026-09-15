import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const TZ = "Asia/Jakarta";

function todayStr() {
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ });
}
function wibStart(dateStr: string) {
  return new Date(dateStr + "T00:00:00+07:00");
}
function wibEnd(dateStr: string) {
  return new Date(dateStr + "T23:59:59+07:00");
}

function ranges(period: string): { cur: { start: Date; end: Date }; prev: { start: Date; end: Date } } {
  const today = todayStr();
  const todayStart = wibStart(today);
  const todayEnd   = wibEnd(today);

  if (period === "day") {
    const yesterday = new Date(todayStart.getTime() - 86_400_000)
      .toLocaleDateString("en-CA", { timeZone: TZ });
    return {
      cur:  { start: todayStart, end: todayEnd },
      prev: { start: wibStart(yesterday), end: wibEnd(yesterday) },
    };
  }

  if (period === "week") {
    const curStart = new Date(todayStart.getTime() - 6 * 86_400_000);
    curStart.setHours(0, 0, 0, 0);
    const prevEnd   = new Date(curStart.getTime() - 1);
    const prevStart = new Date(curStart.getTime() - 7 * 86_400_000);
    return {
      cur:  { start: curStart, end: todayEnd },
      prev: { start: prevStart, end: prevEnd },
    };
  }

  // Rolling 30 hari
  const curStart = new Date(todayStart.getTime() - 29 * 86_400_000);
  curStart.setHours(0, 0, 0, 0);
  const prevEnd   = new Date(curStart.getTime() - 1);
  const prevStart = new Date(curStart.getTime() - 30 * 86_400_000);
  return {
    cur:  { start: curStart, end: todayEnd },
    prev: { start: prevStart, end: prevEnd },
  };
}

async function fetchFailReasons(start: Date, end: Date): Promise<{ reason: string; count: number }[]> {
  const rows = await prisma.salesJournal.groupBy({
    by: ["cancelReason"],
    where: {
      createdAt: { gte: start, lte: end },
      isClosingFail: true,
    },
    _count: { _all: true },
    orderBy: { _count: { cancelReason: "desc" } },
  });

  return rows.map((r) => ({
    reason: r.cancelReason?.trim() || "Tidak dicatat",
    count: r._count._all,
  }));
}

async function fetchMetrics(start: Date, end: Date) {
  const [leads, closings, failRows, activity, messages] = await Promise.all([
    prisma.salesJournal.findMany({
      where: { createdAt: { gte: start, lte: end } },
      select: { customerId: true },
      distinct: ["customerId"],
    }),
    prisma.customer.count({ where: { closedAt: { gte: start, lte: end } } }),
    fetchFailReasons(start, end),
    prisma.salesJournal.count({ where: { createdAt: { gte: start, lte: end } } }),
    prisma.message.count({ where: { direction: "IN", createdAt: { gte: start, lte: end } } }),
  ]);

  const totalLeads  = leads.length;
  const fails       = failRows.reduce((s, r) => s + r.count, 0);
  const closingRate = totalLeads > 0
    ? parseFloat(((closings / totalLeads) * 100).toFixed(2))
    : 0;

  return { totalLeads, closings, fails, failReasons: failRows, activity, messages, closingRate };
}

function delta(cur: number, prev: number): { pct: number | null; dir: "up" | "down" | "same" } {
  if (prev === 0 && cur === 0) return { pct: null, dir: "same" };
  if (prev === 0) return { pct: null, dir: "up" };
  const pct = parseFloat((((cur - prev) / prev) * 100).toFixed(1));
  return { pct: Math.abs(pct), dir: pct > 0 ? "up" : pct < 0 ? "down" : "same" };
}

type Metrics = Awaited<ReturnType<typeof fetchMetrics>>;

function p(cur: number, prev: number): number | null {
  if (prev === 0) return null;
  return parseFloat((((cur - prev) / prev) * 100).toFixed(1));
}
function ab(n: number) { return Math.abs(n); }

function inferMetricCauses(cur: Metrics, prev: Metrics): Record<string, string[]> {
  const dLeads    = cur.totalLeads - prev.totalLeads;
  const dClosings = cur.closings - prev.closings;
  const dFails    = cur.fails - prev.fails;
  const dActivity = cur.activity - prev.activity;
  const dMsgs     = cur.messages - prev.messages;

  const pLeads    = p(cur.totalLeads, prev.totalLeads);
  const pClosings = p(cur.closings, prev.closings);
  const pMsgs     = p(cur.messages, prev.messages);

  const causes: Record<string, string[]> = {
    leads: [], closingRate: [], closings: [], activity: [], messages: [],
  };

  // ── Total Lead ──────────────────────────────────────────────────
  if (dLeads > 0) {
    if (dMsgs > 0)
      causes.leads.push(`Pesan masuk naik ${pMsgs !== null ? ab(pMsgs) + "%" : ab(dMsgs) + " pesan"} → lebih banyak customer baru masuk`);
    if (dActivity > 0)
      causes.leads.push(`Aktivitas jurnal naik ${dActivity} entri → team lebih aktif mengidentifikasi lead`);
    if (dMsgs <= 0 && dActivity <= 0)
      causes.leads.push(`Lead bertambah ${dLeads} — mungkin ada promosi atau referral yang masuk`);
  } else if (dLeads < 0) {
    if (dMsgs < 0)
      causes.leads.push(`Pesan masuk turun ${pMsgs !== null ? ab(pMsgs) + "%" : ab(dMsgs) + " pesan"} → lebih sedikit customer baru masuk`);
    if (dActivity < 0)
      causes.leads.push(`Aktivitas jurnal turun ${ab(dActivity)} entri → kurang proaktif dalam identifikasi lead baru`);
    if (dMsgs >= 0 && dActivity >= 0)
      causes.leads.push(`Lead berkurang ${ab(dLeads)} meski pesan masuk stabil — pastikan semua customer baru dicatat sebagai lead`);
  } else {
    causes.leads.push(`Jumlah lead stabil — sama dengan periode sebelumnya`);
  }

  // ── Closing Rate ────────────────────────────────────────────────
  const rateDir = cur.closingRate - prev.closingRate;
  if (rateDir > 0) {
    if (pClosings !== null && pLeads !== null && pClosings > pLeads)
      causes.closingRate.push(`Closing naik lebih cepat (${ab(pClosings)}%) dibanding lead baru (${ab(pLeads)}%) → kualitas konversi membaik`);
    if (dActivity > 0)
      causes.closingRate.push(`Aktivitas jurnal naik ${dActivity} entri → follow up lebih intensif mendorong konversi`);
    if (dFails < 0)
      causes.closingRate.push(`Gagal closing berkurang ${ab(dFails)} → kualitas pendekatan ke customer meningkat`);
    if (dClosings > 0 && causes.closingRate.length === 0)
      causes.closingRate.push(`${dClosings} closing tambahan berhasil dibukukan di periode ini`);
  } else if (rateDir < 0) {
    if (pLeads !== null && (pClosings === null || ab(pLeads) > ab(pClosings ?? 0)))
      causes.closingRate.push(`Lead baru masuk lebih banyak (${ab(pLeads)}%) sementara closing belum mengikuti → lead baru perlu waktu matang`);
    if (dActivity < 0)
      causes.closingRate.push(`Aktivitas jurnal turun ${ab(dActivity)} entri → intensitas follow up berkurang`);
    if (dFails > 0)
      causes.closingRate.push(`Gagal closing bertambah ${dFails} — lihat breakdown alasan di bawah`);
    if (dClosings < 0 && dLeads >= 0)
      causes.closingRate.push(`Closing berkurang ${ab(dClosings)} padahal lead tidak turun → evaluasi kualitas follow up dan timing closing`);
  } else {
    causes.closingRate.push(`Closing rate stabil — proporsi lead yang berhasil dikonversi konsisten`);
  }

  // ── Closing ─────────────────────────────────────────────────────
  if (dClosings > 0) {
    if (dActivity > 0)
      causes.closings.push(`Aktivitas jurnal naik ${dActivity} entri → follow up lebih aktif mendorong ${dClosings} closing tambahan`);
    if (dLeads > 0)
      causes.closings.push(`Lead bertambah ${dLeads} → lebih banyak prospek yang bisa dikonversi`);
    if (dFails < 0)
      causes.closings.push(`Gagal closing berkurang ${ab(dFails)} → pendekatan ke customer lebih tepat sasaran`);
    if (causes.closings.length === 0)
      causes.closings.push(`${dClosings} closing baru dibukukan — pertahankan ritme follow up ini`);
  } else if (dClosings < 0) {
    if (dActivity < 0)
      causes.closings.push(`Aktivitas jurnal turun ${ab(dActivity)} entri → follow up berkurang langsung berpengaruh ke jumlah closing`);
    if (dLeads < 0)
      causes.closings.push(`Lead berkurang ${ab(dLeads)} → lebih sedikit prospek yang tersedia untuk dikonversi`);
    if (dFails > 0)
      causes.closings.push(`Gagal closing bertambah ${dFails} — lihat breakdown alasan di bawah`);
    if (causes.closings.length === 0)
      causes.closings.push(`Closing berkurang ${ab(dClosings)} — perlu review pipeline lead yang siap dikonversi`);
  } else {
    causes.closings.push(`Jumlah closing sama dengan periode sebelumnya`);
    if (dActivity > 0) causes.closings.push(`Walaupun jurnal naik, closing stagnan — cek kualitas lead yang sedang difollow up`);
  }

  // ── Aktivitas Jurnal ────────────────────────────────────────────
  if (dActivity > 0) {
    if (dMsgs > 0 && ab(dMsgs) >= 5)
      causes.activity.push(`Pesan masuk naik ${ab(dMsgs)} → lebih banyak chat yang perlu direspons dan dicatat`);
    if (dLeads > 0)
      causes.activity.push(`Lead bertambah ${dLeads} → lebih banyak jurnal perlu ditulis per lead`);
    causes.activity.push(`Team mencatat ${dActivity} entri lebih banyak — konsistensi pencatatan membaik`);
  } else if (dActivity < 0) {
    if (dMsgs < 0 && ab(dMsgs) >= 5)
      causes.activity.push(`Pesan masuk turun ${ab(dMsgs)} → lebih sedikit chat yang perlu ditangani agent`);
    if (dLeads < 0)
      causes.activity.push(`Lead berkurang ${ab(dLeads)} → lebih sedikit lead yang perlu dijurnal`);
    causes.activity.push(`Team mencatat ${ab(dActivity)} entri lebih sedikit — perhatikan konsistensi pencatatan jurnal harian`);
  } else {
    causes.activity.push(`Aktivitas jurnal stabil dibanding periode sebelumnya`);
  }

  // ── Pesan Masuk ─────────────────────────────────────────────────
  if (dMsgs > 0) {
    if (dLeads > 0)
      causes.messages.push(`Lead bertambah ${dLeads} → lebih banyak customer aktif yang mengirim pesan`);
    const ratio     = cur.totalLeads  > 0 ? (cur.messages  / cur.totalLeads).toFixed(1)  : null;
    const prevRatio = prev.totalLeads > 0 ? (prev.messages / prev.totalLeads).toFixed(1) : null;
    if (ratio && prevRatio)
      causes.messages.push(`Rata-rata pesan per lead: ${ratio} (sebelumnya ${prevRatio}) → customer lebih aktif berinteraksi`);
    if (causes.messages.length === 0)
      causes.messages.push(`Pesan masuk naik ${ab(dMsgs)} — kemungkinan ada promosi atau konten yang menarik banyak respon`);
  } else if (dMsgs < 0 && ab(dMsgs) >= 5) {
    if (dLeads < 0)
      causes.messages.push(`Lead berkurang ${ab(dLeads)} → lebih sedikit customer yang aktif berkomunikasi`);
    causes.messages.push(`Pesan masuk berkurang ${ab(dMsgs)} — cek apakah ada penurunan traffic dari channel WhatsApp`);
    if (dLeads >= 0)
      causes.messages.push(`Lead tidak turun tapi pesan masuk berkurang — customer yang ada kurang aktif merespons`);
  } else {
    causes.messages.push(`Volume pesan masuk relatif stabil`);
  }

  for (const key of Object.keys(causes)) {
    causes[key] = causes[key].slice(0, 3);
  }
  return causes;
}

// Bandingkan breakdown alasan gagal: mana yang paling banyak naik di periode ini vs sebelumnya
function diffFailReasons(
  cur: { reason: string; count: number }[],
  prev: { reason: string; count: number }[],
) {
  const prevMap = new Map(prev.map((r) => [r.reason, r.count]));
  const all = new Map<string, { curCount: number; prevCount: number }>();

  for (const r of cur)  all.set(r.reason, { curCount: r.count, prevCount: prevMap.get(r.reason) ?? 0 });
  for (const r of prev) if (!all.has(r.reason)) all.set(r.reason, { curCount: 0, prevCount: r.count });

  return Array.from(all.entries())
    .map(([reason, { curCount, prevCount }]) => ({
      reason,
      curCount,
      prevCount,
      diff: curCount - prevCount,
    }))
    .sort((a, b) => b.curCount - a.curCount); // urut dari terbanyak periode ini
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const period = (new URL(req.url).searchParams.get("period") ?? "day") as "day" | "week" | "month";
  const { cur, prev } = ranges(period);

  const [curData, prevData] = await Promise.all([
    fetchMetrics(cur.start, cur.end),
    fetchMetrics(prev.start, prev.end),
  ]);

  const metricCauses  = inferMetricCauses(curData, prevData);
  const failBreakdown = diffFailReasons(curData.failReasons, prevData.failReasons);

  return NextResponse.json({
    period,
    curRange:  { start: cur.start,  end: cur.end  },
    prevRange: { start: prev.start, end: prev.end },
    cur:  curData,
    prev: prevData,
    delta: {
      leads:       delta(curData.totalLeads,   prevData.totalLeads),
      closingRate: delta(curData.closingRate,  prevData.closingRate),
      closings:    delta(curData.closings,     prevData.closings),
      activity:    delta(curData.activity,     prevData.activity),
      messages:    delta(curData.messages,     prevData.messages),
    },
    metricCauses,
    failBreakdown, // breakdown alasan gagal closing dengan perbandingan antar periode
  });
}
