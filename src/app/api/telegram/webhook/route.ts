import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendTelegram } from "@/lib/notify";

export const dynamic = "force-dynamic";

// Webhook bot Telegram notifikasi. Menangani /start (subscribe) & /stop (berhenti).
export async function POST(req: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && req.headers.get("x-telegram-bot-api-secret-token") !== secret)
    return NextResponse.json({ error: "forbidden" }, { status: 401 });

  const token = process.env.TELEGRAM_NOTIFY_TOKEN;
  const update = await req.json().catch(() => null);
  const msg = update?.message ?? update?.edited_message;
  const chat = msg?.chat;
  if (!chat?.id) return NextResponse.json({ ok: true });

  const chatId = String(chat.id);
  const cmd = (msg.text ?? "").trim().toLowerCase();
  const name =
    chat.title ||
    [chat.first_name, chat.last_name].filter(Boolean).join(" ") ||
    (msg.from?.username ? `@${msg.from.username}` : null);

  if (cmd.startsWith("/start")) {
    await prisma.notifySubscriber.upsert({
      where: { chatId },
      update: { active: true, name },
      create: { chatId, name, active: true },
    });
    if (token)
      await sendTelegram(token, chatId, "✅ Kamu sudah subscribe notifikasi chat masuk Aqma CRM.\nKetik /stop kapan saja untuk berhenti.");
  } else if (cmd.startsWith("/stop")) {
    await prisma.notifySubscriber
      .updateMany({ where: { chatId }, data: { active: false } });
    if (token)
      await sendTelegram(token, chatId, "🔕 Notifikasi dimatikan.\nKetik /start untuk mulai lagi.");
  } else if (token) {
    await sendTelegram(token, chatId, "Bot notifikasi Aqma CRM.\nKetik /start untuk mulai terima notifikasi chat masuk, /stop untuk berhenti.");
  }

  return NextResponse.json({ ok: true });
}
