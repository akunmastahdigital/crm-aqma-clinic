import "server-only";
import crypto from "crypto";
import { prisma } from "@/lib/db";

export function hashKey(raw: string) {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export function generateApiKey() {
  const raw = "kc_live_" + crypto.randomBytes(24).toString("hex");
  return { raw, prefix: raw.slice(0, 16), keyHash: hashKey(raw) };
}

// Verifikasi request pakai header Authorization: Bearer <key>. null kalau invalid.
export async function verifyApiKey(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const key = await prisma.apiKey.findUnique({ where: { keyHash: hashKey(m[1].trim()) } });
  if (!key || !key.active) return null;
  await prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } });
  return key;
}
