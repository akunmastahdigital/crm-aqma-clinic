// Aturan perilaku chatbot: jam kerja & eskalasi. Fungsi murni.

export type WorkDay = { open: boolean; start: string; end: string };

export const DEFAULT_WORKDAYS: WorkDay[] = [
  { open: false, start: "08:00", end: "17:00" }, // 0 Minggu
  { open: true, start: "08:00", end: "17:00" }, // 1 Senin
  { open: true, start: "08:00", end: "17:00" }, // 2 Selasa
  { open: true, start: "08:00", end: "17:00" }, // 3 Rabu
  { open: true, start: "08:00", end: "17:00" }, // 4 Kamis
  { open: true, start: "08:00", end: "17:00" }, // 5 Jumat
  { open: true, start: "08:00", end: "14:00" }, // 6 Sabtu
];

type HoursConfig = {
  workHoursEnabled: boolean;
  workTimezone: string;
  workDays: unknown;
};

// true kalau SEKARANG di luar jam kerja (zona yang diset, mis. Asia/Jakarta).
export function isOutsideHours(cfg: HoursConfig): boolean {
  if (!cfg.workHoursEnabled) return false;
  const days: WorkDay[] = Array.isArray(cfg.workDays)
    ? (cfg.workDays as WorkDay[])
    : DEFAULT_WORKDAYS;
  const tz = cfg.workTimezone || "Asia/Jakarta";

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const wd = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10) % 24;
  const minute = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
  const idx = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd);
  const day = days[idx] ?? { open: false, start: "08:00", end: "17:00" };
  if (!day.open) return true;

  const mins = hour * 60 + minute;
  const [sh, sm] = day.start.split(":").map(Number);
  const [eh, em] = day.end.split(":").map(Number);
  return mins < sh * 60 + sm || mins >= eh * 60 + em;
}

export function matchesEscalation(
  text: string,
  cfg: { escalationKeywords: string[] },
): boolean {
  const t = text.toLowerCase();
  return (cfg.escalationKeywords ?? []).some(
    (k) => k.trim() && t.includes(k.trim().toLowerCase()),
  );
}
