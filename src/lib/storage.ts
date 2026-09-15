import { writeFile, mkdir } from "fs/promises";
import path from "path";

// Storage adapter — sekarang simpan di disk server. Pindah ke R2 nanti
// cukup ganti implementasi saveMedia (URL & pemanggil tetap sama).

// Simpan di /var/www agar bisa disajikan nginx (www-data tak bisa baca /root).
const DIR = process.env.MEDIA_DIR || "/var/www/crm-uploads";
const BASE = process.env.MEDIA_BASE_URL || "/uploads";

export type MediaType = "image" | "video" | "audio" | "document";

export function mediaTypeFromMime(mime: string): MediaType {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "document";
}

function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "application/pdf": ".pdf",
  };
  return map[mime] || "";
}

export type SavedMedia = { url: string; type: MediaType; name: string };

export async function saveMedia(
  buffer: Buffer,
  originalName: string,
  mime: string,
): Promise<SavedMedia> {
  const ext = path.extname(originalName) || extFromMime(mime);
  const rand = Math.random().toString(36).slice(2, 8);
  const filename = `${Date.now()}-${rand}${ext}`;
  await mkdir(DIR, { recursive: true });
  await writeFile(path.join(DIR, filename), buffer);
  return {
    url: `${BASE}/${filename}`,
    type: mediaTypeFromMime(mime),
    name: originalName,
  };
}
