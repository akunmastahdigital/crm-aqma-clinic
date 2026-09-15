import { prisma } from "./db";

export type DaySetting = {
  day: number;   // 0 = Minggu, 1 = Senin, ..., 6 = Sabtu
  name: string;
  open: boolean;
  start: string; // "HH:MM"
  end: string;   // "HH:MM"
};

export type BusinessHours = {
  enabled: boolean;
  timezone: string;
  autoReplyEnabled: boolean;
  outsideMessage: string;
  days: DaySetting[];
};

export const DAY_NAMES = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

export const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  enabled: false,
  timezone: "Asia/Jakarta",
  autoReplyEnabled: false,
  outsideMessage:
    "Halo! Terima kasih sudah menghubungi kami 🙏\nSaat ini kami sedang di luar jam kerja. Tim kami akan segera membalas pada jam kerja berikutnya.\nJam kerja kami: Senin–Jumat, 08:00–17:00 WIB.",
  days: DAY_NAMES.map((name, day) => ({
    day,
    name,
    open: day >= 1 && day <= 5,
    start: "08:00",
    end: "17:00",
  })),
};

export async function getBusinessHours(): Promise<BusinessHours> {
  const row = await prisma.crmSetting.findUnique({ where: { key: "business_hours" } });
  if (!row) return DEFAULT_BUSINESS_HOURS;
  try {
    const parsed = JSON.parse(row.value) as Partial<BusinessHours>;
    return { ...DEFAULT_BUSINESS_HOURS, ...parsed };
  } catch {
    return DEFAULT_BUSINESS_HOURS;
  }
}

// Cek apakah `date` (default: sekarang) termasuk dalam jam kerja
export function isInsideBusinessHours(bh: BusinessHours, date: Date = new Date()): boolean {
  if (!bh.enabled) return true; // kalau tidak diaktifkan, selalu dianggap jam kerja

  const tz = bh.timezone || "Asia/Jakarta";
  const local = new Date(date.toLocaleString("en-US", { timeZone: tz }));
  const dayOfWeek = local.getDay();
  const daySetting = bh.days.find((d) => d.day === dayOfWeek);

  if (!daySetting?.open) return false;

  const [startH, startM] = daySetting.start.split(":").map(Number);
  const [endH, endM] = daySetting.end.split(":").map(Number);
  const nowMinutes = local.getHours() * 60 + local.getMinutes();
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  return nowMinutes >= startMinutes && nowMinutes < endMinutes;
}

// Hitung berapa menit "business time" antara dua waktu
// (untuk FRT dan ART dengan business hours)
export function businessMinutesBetween(bh: BusinessHours, from: Date, to: Date): number {
  if (!bh.enabled) {
    return Math.max(0, Math.round((to.getTime() - from.getTime()) / 60_000));
  }

  const tz = bh.timezone || "Asia/Jakarta";
  let cursor = new Date(from.getTime());
  let minutes = 0;

  // Walk minute-by-minute hanya untuk selisih kecil; pakai interval 1 menit
  // Untuk produksi bisa dioptimasi, tapi untuk sekarang ini sudah cukup
  const maxMinutes = Math.round((to.getTime() - from.getTime()) / 60_000);
  if (maxMinutes <= 0) return 0;

  for (let i = 0; i < maxMinutes; i++) {
    if (isInsideBusinessHours(bh, cursor)) minutes++;
    cursor = new Date(cursor.getTime() + 60_000);
  }

  return minutes;
}
