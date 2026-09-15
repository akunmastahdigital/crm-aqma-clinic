import webpush from "web-push";
import { prisma } from "@/lib/db";

// VAPID di-set malas (lazy), bukan saat modul di-import.
// Kalau di-set saat import, build gagal di mesin yang belum punya env VAPID,
// dan seluruh route yang menyentuh modul ini ikut mati.
let vapidReady: boolean | null = null;

function ensureVapid(): boolean {
  if (vapidReady !== null) return vapidReady;
  const subject = process.env.VAPID_SUBJECT;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!subject || !publicKey || !privateKey) {
    console.warn("[push] VAPID belum di-set, notifikasi push dinonaktifkan.");
    vapidReady = false;
    return false;
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidReady = true;
  return true;
}

export interface PushPayload {
  title: string;
  body: string;
  conversationId?: string;
  url?: string;
}

async function isPushEnabled(): Promise<boolean> {
  if (!ensureVapid()) return false;
  try {
    const row = await prisma.crmSetting.findUnique({ where: { key: "push_notif_enabled" } });
    if (!row) return true;
    return JSON.parse(row.value) !== false;
  } catch { return true; }
}

// Kirim push ke semua subscription yang aktif
export async function sendPushToAll(payload: PushPayload) {
  if (!await isPushEnabled()) return;
  const subs = await prisma.pushSubscription.findMany();
  if (subs.length === 0) return;

  const data = JSON.stringify(payload);
  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          data,
        );
      } catch (err: unknown) {
        // Subscription expired/invalid — hapus dari DB
        if (err && typeof err === "object" && "statusCode" in err &&
            (err.statusCode === 410 || err.statusCode === 404)) {
          await prisma.pushSubscription.deleteMany({ where: { endpoint: sub.endpoint } });
        }
      }
    })
  );
}

// Kirim push ke subscription milik satu user saja
export async function sendPushToUser(userId: string, payload: PushPayload) {
  if (!await isPushEnabled()) return;
  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  if (subs.length === 0) return;

  const data = JSON.stringify(payload);
  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          data,
        );
      } catch (err: unknown) {
        if (err && typeof err === "object" && "statusCode" in err &&
            (err.statusCode === 410 || err.statusCode === 404)) {
          await prisma.pushSubscription.deleteMany({ where: { endpoint: sub.endpoint } });
        }
      }
    })
  );
}
