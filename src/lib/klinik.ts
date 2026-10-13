import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession, type SessionUser } from "@/lib/auth";
import { can, isReadOnly } from "@/lib/rbac";

// Gerbang izin bersama untuk seluruh endpoint Pengaturan Klinik.
//
// Dipisah ke satu tempat supaya tidak terulang masalah yang ditemukan di
// endpoint merge: di sana pengecekan izin lupa dipasang, sehingga role VIEWER
// yang seharusnya hanya melihat bisa menghapus data permanen.
//
// write = true untuk operasi yang mengubah data.
export async function guardKlinik(
  write: boolean,
): Promise<{ session: SessionUser } | { error: NextResponse }> {
  const session = await getSession();
  if (!session) {
    return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }
  if (!can(session.role, "manage_crm_settings")) {
    return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }
  if (write && isReadOnly(session.role)) {
    return {
      error: NextResponse.json(
        { error: "Akun ini hanya dapat melihat data." },
        { status: 403 },
      ),
    };
  }
  return { session };
}

// Mengubah error zod jadi pesan yang bisa dibaca orang, bukan dump JSON.
export function badRequest(err: z.ZodError) {
  const first = err.issues[0];
  const field = first?.path.join(".");
  return NextResponse.json(
    { error: field ? `${field}: ${first.message}` : first?.message ?? "Data tidak valid" },
    { status: 400 },
  );
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

// Jam operasional: 7 hari, index 0 = Minggu. Konvensi disamakan dengan
// AiSettings.workDays supaya tidak ada dua cara membaca jam di sistem ini.
export const openingHoursSchema = z
  .array(
    z.object({
      open: z.boolean(),
      start: z.string().regex(TIME, "format jam harus HH:MM"),
      end: z.string().regex(TIME, "format jam harus HH:MM"),
    }),
  )
  .length(7, "jam operasional harus 7 hari")
  .refine(
    (days) => days.every((d) => !d.open || d.start < d.end),
    "jam tutup harus lebih besar dari jam buka",
  )
  .nullable()
  .optional();

export const DEFAULT_OPENING_HOURS = [
  { open: false, start: "09:00", end: "17:00" }, // Minggu
  { open: true, start: "09:00", end: "19:00" },
  { open: true, start: "09:00", end: "19:00" },
  { open: true, start: "09:00", end: "19:00" },
  { open: true, start: "09:00", end: "19:00" },
  { open: true, start: "09:00", end: "19:00" },
  { open: true, start: "09:00", end: "17:00" }, // Sabtu
];

export const HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
