#!/usr/bin/env node
/**
 * journal-reminder.js
 * Kirim reminder Telegram ke agent yang belum isi jurnal hari ini
 * tapi punya percakapan aktif. Dijalankan jam 13:30 dan 16:30 WIB.
 */

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const TG_TOKEN = process.env.TELEGRAM_NOTIFY_TOKEN;

async function sendTelegram(chatId, text) {
  if (!TG_TOKEN || !chatId) return;
  try {
    const res = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error(`TG error for chatId ${chatId}:`, err);
    }
  } catch (e) {
    console.error("TG fetch error:", e);
  }
}

async function main() {
  const now = new Date();
  const jakartaOffset = 7 * 60 * 60 * 1000;
  const nowJakarta = new Date(now.getTime() + jakartaOffset);
  const startOfDay = new Date(
    Date.UTC(nowJakarta.getUTCFullYear(), nowJakarta.getUTCMonth(), nowJakarta.getUTCDate())
  );
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

  // Ambil semua agent aktif dengan telegramId
  const agents = await prisma.user.findMany({
    where: { active: true, role: "AGENT", telegramId: { not: null } },
    select: { id: true, name: true, telegramId: true },
  });

  console.log(`Checking ${agents.length} agents with Telegram ID...`);

  for (const agent of agents) {
    // Sudah isi jurnal hari ini?
    const hasJournal = await prisma.salesJournal.findFirst({
      where: { userId: agent.id, createdAt: { gte: startOfDay, lt: endOfDay } },
      select: { id: true },
    });
    if (hasJournal) {
      console.log(`${agent.name}: sudah ada jurnal, skip`);
      continue;
    }

    // Ada percakapan aktif hari ini?
    const activeMsg = await prisma.message.findFirst({
      where: {
        createdAt: { gte: startOfDay, lt: endOfDay },
        conversation: { assignedToId: agent.id },
      },
      select: { id: true },
    });
    if (!activeMsg) {
      console.log(`${agent.name}: tidak ada chat aktif hari ini, skip`);
      continue;
    }

    console.log(`${agent.name}: kirim reminder Telegram...`);
    const jam = nowJakarta.getUTCHours();
    const pesan = jam >= 16
      ? `⚠️ <b>Reminder Sore</b>\n\nHei ${agent.name}! Sebelum pulang, jangan lupa isi Jurnal Sales hari ini ya.\n\nCatat aktivitas, label lead, dan jadwal follow up berikutnya. 📋`
      : `📋 <b>Reminder Siang</b>\n\nHei ${agent.name}! Sudah siang nih, sudah isi Jurnal Sales belum?\n\nYuk catat perkembangan lead hari ini sebelum ketinggalan!`;

    await sendTelegram(agent.telegramId, pesan);
  }

  console.log("Done.");
  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
