// Worker WhatsApp mode QR (Baileys) — proses terpisah yang nyala terus.
// - Sambung WA via scan QR, sesi disimpan di WA_AUTH_DIR.
// - Pesan masuk -> POST ke app (/api/internal/wa-ingest).
// - Server kecil HTTP: GET /status (QR + koneksi), POST /send (kirim pesan).

import { createServer } from "http";
import { fileURLToPath } from "url";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { randomUUID } from "crypto";
import path from "path";
import { Boom } from "@hapi/boom";

// muat .env app (proses worker terpisah dari Next)
try {
  process.loadEnvFile(fileURLToPath(new URL("../.env", import.meta.url)));
} catch {}
import qrcode from "qrcode";
import baileysPkg, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  downloadMediaMessage,
} from "@whiskeysockets/baileys";

const makeWASocket = baileysPkg.makeWASocket || baileysPkg.default || baileysPkg;

const AUTH_DIR = process.env.WA_AUTH_DIR || "/root/crm-wa-auth";
const APP_URL = process.env.APP_URL || "http://127.0.0.1:3040";
const SECRET = process.env.INTERNAL_SECRET || "changeme";
const PORT = Number(process.env.WA_WORKER_PORT || 3041);
const CHANNEL_ID = process.env.WA_CHANNEL_ID || null;
const MEDIA_DIR = process.env.MEDIA_DIR || "/var/www/crm-uploads";

const MIME = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
  csv: "text/csv",
  zip: "application/zip",
};
const mimeFor = (name) => MIME[(name || "").split(".").pop().toLowerCase()] || "application/octet-stream";
const localOf = (url) => path.join(MEDIA_DIR, String(url).split("/").pop().split("?")[0]);

// ekstensi file dari mimetype (buat menyimpan media masuk)
const EXT = {
  "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif",
  "video/mp4": ".mp4", "video/3gpp": ".3gp", "video/quicktime": ".mov",
  "audio/ogg": ".ogg", "audio/mpeg": ".mp3", "audio/mp4": ".m4a", "audio/amr": ".amr",
  "application/pdf": ".pdf",
};
const extFor = (mime, fallback = "") => EXT[(mime || "").split(";")[0]] || fallback;

// Deteksi jenis media pesan masuk -> {kind, mime, filename, caption}
function detectMedia(msg) {
  if (msg.imageMessage) return { kind: "image", mime: msg.imageMessage.mimetype, caption: msg.imageMessage.caption || "" };
  if (msg.videoMessage) return { kind: "video", mime: msg.videoMessage.mimetype, caption: msg.videoMessage.caption || "" };
  if (msg.audioMessage) return { kind: "audio", mime: msg.audioMessage.mimetype, caption: "" };
  if (msg.stickerMessage) return { kind: "image", mime: msg.stickerMessage.mimetype || "image/webp", caption: "" };
  if (msg.documentMessage) return { kind: "document", mime: msg.documentMessage.mimetype, filename: msg.documentMessage.fileName, caption: msg.documentMessage.caption || "" };
  if (msg.documentWithCaptionMessage?.message?.documentMessage) {
    const d = msg.documentWithCaptionMessage.message.documentMessage;
    return { kind: "document", mime: d.mimetype, filename: d.fileName, caption: d.caption || "" };
  }
  return null;
}

// wamid bubble yang dibalas pelanggan (kutipan)
function quotedIdOf(msg) {
  const ci =
    msg.extendedTextMessage?.contextInfo ||
    msg.imageMessage?.contextInfo ||
    msg.videoMessage?.contextInfo ||
    msg.audioMessage?.contextInfo ||
    msg.documentMessage?.contextInfo ||
    msg.stickerMessage?.contextInfo;
  return ci?.stanzaId || null;
}

const logger = {
  level: "silent",
  trace() {}, debug() {}, info() {}, warn() {}, error() {}, fatal() {},
  child() { return logger; },
};

const state = { connected: false, qr: null, number: null };
let sock = null;

// --- Antrian kirim pesan (serial, jeda antar pesan agar tidak spam-detected) ---
const SEND_DELAY_MS = 400;
const sendQueue = [];
let queueRunning = false;

async function runQueue() {
  if (queueRunning) return;
  queueRunning = true;
  while (sendQueue.length > 0) {
    const { task, resolve, reject } = sendQueue.shift();
    try { resolve(await task()); } catch (e) { reject(e); }
    if (sendQueue.length > 0) await new Promise((r) => setTimeout(r, SEND_DELAY_MS));
  }
  queueRunning = false;
}

function enqueue(task) {
  return new Promise((resolve, reject) => {
    sendQueue.push({ task, resolve, reject });
    runQueue();
  });
}

// Pesan masuk non-teks: tampilkan penanda jenis (human agent unduh manual dari WA).
function extractIncomingText(msg) {
  if (msg.conversation) return msg.conversation;
  if (msg.extendedTextMessage?.text) return msg.extendedTextMessage.text;
  if (msg.imageMessage) return msg.imageMessage.caption ? `📷 [Gambar] ${msg.imageMessage.caption}` : "📷 [Gambar]";
  if (msg.videoMessage) return msg.videoMessage.caption ? `🎥 [Video] ${msg.videoMessage.caption}` : "🎥 [Video]";
  if (msg.audioMessage) return msg.audioMessage.ptt ? "🎙️ [Voice note]" : "🎵 [Audio]";
  if (msg.documentMessage) return `📎 [Dokumen] ${msg.documentMessage.fileName || ""}`.trim();
  if (msg.stickerMessage) return "🌟 [Stiker]";
  if (msg.locationMessage) return "📍 [Lokasi]";
  if (msg.contactMessage || msg.contactsArrayMessage) return "👤 [Kontak]";
  return "";
}

async function start() {
  const { state: authState, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: authState,
    logger,
    printQRInTerminal: false,
    browser: ["Aqma CRM", "Chrome", "1.0"],
    syncFullHistory: true,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (u) => {
    const { connection, lastDisconnect, qr } = u;
    if (qr) {
      state.qr = await qrcode.toDataURL(qr);
      state.connected = false;
    }
    if (connection === "open") {
      state.connected = true;
      state.qr = null;
      state.number = (sock.user?.id || "").split(":")[0].split("@")[0] || null;
      console.log("WA connected:", state.number);
    }
    if (connection === "close") {
      state.connected = false;
      const code = new Boom(lastDisconnect?.error)?.output?.statusCode;
      console.log("WA closed, code:", code);
      if (code === DisconnectReason.loggedOut) {
        state.number = null;
        // sesi invalid — biarkan QR baru muncul saat restart
      } else {
        setTimeout(() => start().catch((e) => console.error(e)), 3000);
      }
    }
  });

  // Perubahan status pesan keluar kita (ceklis: terkirim/dibaca)
  sock.ev.on("messages.update", async (updates) => {
    for (const u of updates) {
      try {
        const id = u.key?.id;
        const st = u.update?.status;
        if (!id || !u.key?.fromMe || st == null) continue;
        // Baileys: 2=server(sent), 3=delivered, 4=read, 5=played
        let status = null;
        if (st >= 4) status = "read";
        else if (st === 3) status = "delivered";
        if (!status) continue;
        await fetch(`${APP_URL}/api/internal/wa-status`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-internal-secret": SECRET },
          body: JSON.stringify({ externalId: id, status }),
        }).catch((e) => console.error("status post:", e.message));
      } catch (e) {
        console.error("status update err:", e);
      }
    }
  });

  // Sinkron riwayat chat saat pertama terhubung (syncFullHistory: true)
  sock.ev.on("messaging-history.set", async ({ messages: histMsgs, isLatest }) => {
    if (!histMsgs?.length) return;
    const inboundCount = histMsgs.filter(m => !m.key?.fromMe).length;
    const outboundCount = histMsgs.filter(m => !!m.key?.fromMe).length;
    console.log(`[history] Menerima ${histMsgs.length} pesan riwayat (isLatest=${isLatest}, fromMe=true:${outboundCount}, fromMe=false:${inboundCount})...`);
    let imported = 0;
    let skipped = 0;
    // Urutkan dari terlama ke terbaru agar conversation dibuat dengan timestamp benar
    const sorted = [...histMsgs].sort(
      (a, b) => Number(a.messageTimestamp || 0) - Number(b.messageTimestamp || 0),
    );
    for (const m of sorted) {
      try {
        const jid = m.key?.remoteJid || "";
        if (!jid || jid.endsWith("@g.us") || jid.endsWith("@broadcast")) continue;
        const from = jid.split("@")[0];
        if (!from || from.length < 5) continue;
        const fromMe = !!m.key?.fromMe;
        let msg = m.message || {};
        if (msg.ephemeralMessage?.message) msg = msg.ephemeralMessage.message;
        if (msg.viewOnceMessage?.message) msg = msg.viewOnceMessage.message;
        // Ekstrak teks — untuk media gunakan caption atau placeholder
        const text =
          msg.conversation ||
          msg.extendedTextMessage?.text ||
          (msg.imageMessage ? (msg.imageMessage.caption || "📷 [Gambar]") : "") ||
          (msg.videoMessage ? (msg.videoMessage.caption || "🎥 [Video]") : "") ||
          (msg.audioMessage ? (msg.audioMessage.ptt ? "🎙️ [Voice note]" : "🎵 [Audio]") : "") ||
          (msg.stickerMessage ? "🌟 [Stiker]" : "") ||
          (msg.documentMessage ? `📎 ${msg.documentMessage.fileName || "[Dokumen]"}` : "") ||
          (msg.locationMessage ? "📍 [Lokasi]" : "") ||
          (msg.contactMessage ? "👤 [Kontak]" : "") ||
          "";
        if (!text.trim()) { skipped++; continue; }
        const res = await fetch(`${APP_URL}/api/internal/wa-history-ingest`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-internal-secret": SECRET },
          body: JSON.stringify({
            from,
            name: m.pushName || null,
            text,
            externalId: m.key.id || null,
            fromMe,
            timestamp: Number(m.messageTimestamp || 0) * 1000,
            channelId: CHANNEL_ID,
          }),
        });
        const out = await res.json().catch(() => ({}));
        if (out.skipped) skipped++; else imported++;
        // Throttle: jeda kecil setiap 100 pesan agar tidak flood DB
        if ((imported + skipped) % 100 === 0) {
          await new Promise((r) => setTimeout(r, 300));
        }
      } catch (e) {
        console.error("[history] err:", e.message);
        skipped++;
      }
    }
    console.log(`[history] Selesai: ${imported} diimpor, ${skipped} dilewati.`);
  });

  sock.ev.on("messages.upsert", async (up) => {
    // Pesan historis inbound yang datang lewat "append" — simpan tanpa automation
    if (up.type === "append") {
      for (const m of up.messages) {
        try {
          const jid = m.key?.remoteJid || "";
          if (!jid || jid.endsWith("@g.us") || jid.endsWith("@broadcast")) continue;
          const from = jid.split("@")[0];
          if (!from || from.length < 5) continue;
          const fromMe = !!m.key?.fromMe;
          let msg = m.message || {};
          if (msg.ephemeralMessage?.message) msg = msg.ephemeralMessage.message;
          if (msg.viewOnceMessage?.message) msg = msg.viewOnceMessage.message;
          const text =
            msg.conversation ||
            msg.extendedTextMessage?.text ||
            (msg.imageMessage ? (msg.imageMessage.caption || "📷 [Gambar]") : "") ||
            (msg.videoMessage ? (msg.videoMessage.caption || "🎥 [Video]") : "") ||
            (msg.audioMessage ? (msg.audioMessage.ptt ? "🎙️ [Voice note]" : "🎵 [Audio]") : "") ||
            (msg.stickerMessage ? "🌟 [Stiker]" : "") ||
            (msg.documentMessage ? `📎 ${msg.documentMessage.fileName || "[Dokumen]"}` : "") ||
            (msg.locationMessage ? "📍 [Lokasi]" : "") ||
            (msg.contactMessage ? "👤 [Kontak]" : "") ||
            "";
          if (!text.trim()) continue;
          await fetch(`${APP_URL}/api/internal/wa-history-ingest`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-internal-secret": SECRET },
            body: JSON.stringify({
              from,
              name: m.pushName || null,
              text,
              externalId: m.key.id || null,
              fromMe,
              timestamp: Number(m.messageTimestamp || 0) * 1000,
              channelId: CHANNEL_ID,
            }),
          }).catch((e) => console.error("[append] ingest err:", e.message));
        } catch (e) {
          console.error("[append] err:", e);
        }
      }
      return;
    }

    if (up.type !== "notify") return;
    for (const m of up.messages) {
      try {
        if (m.key.fromMe) continue;
        const jid = m.key.remoteJid || "";
        if (jid.endsWith("@g.us")) continue; // skip grup
        const from = jid.split("@")[0];
        let msg = m.message || {};
        if (msg.ephemeralMessage?.message) msg = msg.ephemeralMessage.message;
        if (msg.viewOnceMessage?.message) msg = msg.viewOnceMessage.message;

        let text = "";
        let mediaUrl = null;
        let mediaType = null;
        const media = detectMedia(msg);
        if (media) {
          text = media.caption || "";
          mediaType = media.kind;
          try {
            const buf = await downloadMediaMessage(m, "buffer", {}, { reuploadRequest: sock.updateMediaMessage });
            mkdirSync(MEDIA_DIR, { recursive: true });
            const ext = media.filename ? (path.extname(media.filename) || extFor(media.mime)) : extFor(media.mime, media.kind === "audio" ? ".ogg" : "");
            const fname = `${Date.now()}-${randomUUID().slice(0, 8)}${ext}`;
            writeFileSync(path.join(MEDIA_DIR, fname), buf);
            mediaUrl = `/uploads/${fname}`;
          } catch (e) {
            console.error("media download err:", e.message);
            // gagal unduh -> tetap kirim penanda teks
            text = text || extractIncomingText(msg);
            mediaType = null;
          }
        } else {
          text = extractIncomingText(msg);
        }

        if (!from || (!text && !mediaUrl)) continue;
        await fetch(`${APP_URL}/api/internal/wa-ingest`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-internal-secret": SECRET },
          body: JSON.stringify({
            from,
            name: m.pushName || null,
            text,
            externalId: m.key.id,
            mediaUrl,
            mediaType,
            replyToExternalId: quotedIdOf(msg),
            channelId: CHANNEL_ID,
          }),
        }).catch((e) => console.error("ingest post:", e.message));
      } catch (e) {
        console.error("upsert err:", e);
      }
    }
  });
}

// --- HTTP server kecil ---
function readBody(req) {
  return new Promise((res) => {
    let d = "";
    req.on("data", (c) => (d += c));
    req.on("end", () => { try { res(JSON.parse(d || "{}")); } catch { res({}); } });
  });
}

createServer(async (req, res) => {
  if (req.headers["x-internal-secret"] !== SECRET) {
    res.writeHead(403); res.end("forbidden"); return;
  }
  if (req.method === "GET" && req.url === "/status") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ connected: state.connected, qr: state.qr, number: state.number }));
    return;
  }
  if (req.method === "POST" && req.url === "/send") {
    const b = await readBody(req);
    try {
      if (!sock || !state.connected) throw new Error("WA belum tersambung");
      const ids = await enqueue(async () => {
        const jid = String(b.to).replace(/\D/g, "") + "@s.whatsapp.net";
        const result = [];

        // kutipan (quoted) hanya nempel di pesan pertama
        let quoted = b.replyTo?.id
          ? {
              key: { remoteJid: jid, fromMe: !!b.replyTo.fromMe, id: String(b.replyTo.id), ...(b.replyTo.fromMe ? {} : { participant: jid }) },
              message: { conversation: String(b.replyTo.text || "") },
            }
          : undefined;
        const opt = () => {
          const o = quoted ? { quoted } : undefined;
          quoted = undefined; // pakai sekali
          return o;
        };

        if (b.text && String(b.text).trim()) {
          const sent = await sock.sendMessage(jid, { text: String(b.text) }, opt());
          result.push(sent?.key?.id || null);
        }
        for (const a of b.attachments || []) {
          const buf = readFileSync(localOf(a.url));
          const cap = a.name || undefined;
          let sent;
          if (a.type === "image") sent = await sock.sendMessage(jid, { image: buf, caption: cap }, opt());
          else if (a.type === "video") sent = await sock.sendMessage(jid, { video: buf, caption: cap }, opt());
          else if (a.type === "audio") sent = await sock.sendMessage(jid, { audio: buf, mimetype: "audio/ogg; codecs=opus", ptt: true }, opt());
          else sent = await sock.sendMessage(jid, { document: buf, mimetype: mimeFor(a.name || a.url), fileName: a.name || String(a.url).split("/").pop() }, opt());
          result.push(sent?.key?.id || null);
        }
        return result;
      });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, ids }));
    } catch (e) {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }
  if (req.method === "POST" && req.url === "/logout") {
    try { await sock?.logout(); } catch {}
    state.connected = false; state.number = null; state.qr = null;
    res.writeHead(200); res.end(JSON.stringify({ ok: true }));
    return;
  }
  res.writeHead(404); res.end("not found");
}).listen(PORT, "127.0.0.1", () => console.log("WA worker HTTP on", PORT));

start().catch((e) => console.error("start err:", e));
