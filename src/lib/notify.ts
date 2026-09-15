// Notifikasi Telegram: kirim ke SEMUA subscriber aktif saat ada chat masuk.
// Subscriber daftar sendiri dengan /start ke bot (lihat /api/telegram/webhook).
// Aktif kalau env TELEGRAM_NOTIFY_TOKEN diisi.
import { prisma } from "@/lib/db";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://crm.klinikaqma.com";

// Kirim satu pesan Telegram ke satu chat. Balikin HTTP status (0 = error jaringan).
export async function sendTelegram(token: string, chatId: string, text: string): Promise<number> {
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    });
    return r.status;
  } catch (e) {
    console.error("sendTelegram error:", e);
    return 0;
  }
}

export async function notifyIncoming(input: {
  name: string | null;
  from: string;
  text: string;
  channelLabel?: string | null;
  conversationId: string;
}) {
  const token = process.env.TELEGRAM_NOTIFY_TOKEN;
  if (!token) return; // belum dikonfigurasi -> lewati

  const who = input.name?.trim() || input.from;
  const preview = (input.text || "[media]").slice(0, 300);
  const via = input.channelLabel ? `\nvia: ${input.channelLabel}` : "";
  const url = `${APP_URL}/inbox?c=${input.conversationId}`;
  const text =
    `💬 Chat masuk dari ${who}\n📱 ${input.from}${via}\n\n"${preview}"\n\n👉 Buka: ${url}`;

  await broadcast(token, text);
}

// Notifikasi lead baru dari Konektor
export async function notifyLead(input: {
  name: string;
  phone: string | null;
  status: string | null;
  customerId: string;
}) {
  const token = process.env.TELEGRAM_NOTIFY_TOKEN;
  if (!token) return;
  const url = `${APP_URL}/customers`;
  const text =
    `🎯 Lead baru (Konektor)\n👤 ${input.name}` +
    (input.phone ? `\n📱 ${input.phone}` : "") +
    (input.status ? `\n📌 Status: ${input.status}` : "") +
    `\n\n👉 ${url}`;
  await broadcast(token, text);
}

// Kirim ke semua subscriber; nonaktifkan hanya kalau user blokir bot (403)
async function broadcast(token: string, text: string) {
  const subs = await prisma.notifySubscriber.findMany({ where: { active: true } });
  await Promise.all(
    subs.map(async (s) => {
      const status = await sendTelegram(token, s.chatId, text);
      if (status === 403) {
        await prisma.notifySubscriber
          .update({ where: { id: s.id }, data: { active: false } })
          .catch(() => {});
      }
    }),
  );
}
