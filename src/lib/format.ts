// Helper format waktu (Bahasa Indonesia, sederhana).

export function relativeTime(date: Date | string | null | undefined): string {
  if (!date) return "-";
  const d = typeof date === "string" ? new Date(date) : date;
  const diff = Date.now() - d.getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return "baru saja";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} menit lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} jam lalu`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days} hari lalu`;
  return d.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// Sisa window 24 jam
export function windowState(expiresAt: Date | string | null | undefined): {
  active: boolean;
  label: string;
} {
  if (!expiresAt) return { active: false, label: "Tutup" };
  const d = typeof expiresAt === "string" ? new Date(expiresAt) : expiresAt;
  const diff = d.getTime() - Date.now();
  if (diff <= 0) return { active: false, label: "Tutup" };
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (h >= 1) return { active: true, label: `Aktif · sisa ${h}j` };
  return { active: true, label: `Aktif · sisa ${m}m` };
}

export function formatDateTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatRupiah(n: number | null | undefined): string {
  if (n == null) return "-";
  return "Rp " + n.toLocaleString("id-ID");
}

export function clockTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

const TZ = "Asia/Jakarta";

function dayStr(d: Date): string {
  return d.toLocaleDateString("id-ID", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
}

export function isSameDay(a: string | Date, b: string | Date): boolean {
  const da = typeof a === "string" ? new Date(a) : a;
  const db = typeof b === "string" ? new Date(b) : b;
  return dayStr(da) === dayStr(db);
}

// "Hari ini" / "Kemarin" / "Selasa, 10 Juli 2026" — untuk separator di thread
export function dateLabel(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  if (dayStr(d) === dayStr(now)) return "Hari ini";
  if (dayStr(d) === dayStr(new Date(now.getTime() - 86_400_000))) return "Kemarin";
  return d.toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: TZ,
  });
}

// Untuk card list: jam kalau hari ini, "Kemarin" kalau kemarin, "10 Jul" kalau lebih lama
export function cardDate(date: Date | string | null | undefined): string {
  if (!date) return "-";
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  if (dayStr(d) === dayStr(now))
    return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
  if (dayStr(d) === dayStr(new Date(now.getTime() - 86_400_000))) return "Kemarin";
  if (d.getFullYear() === now.getFullYear())
    return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", timeZone: TZ });
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "2-digit", timeZone: TZ });
}
