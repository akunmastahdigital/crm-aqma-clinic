import { execFile, spawn } from "child_process";
import { promisify } from "util";
import { writeFileSync, unlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import type { Browser } from "playwright";

const execFileAsync = promisify(execFile);

type ChatMsg = { role: "system" | "user" | "assistant"; content: string };

// ─── ChatGPT Headless Browser (Playwright) ────────────────────────────────────

let _browser: Browser | null = null;

async function getHeadlessBrowser(): Promise<Browser> {
  if (_browser?.isConnected()) return _browser;
  const { chromium } = await import("playwright");
  _browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  return _browser;
}

export async function callChatGptHeadless(
  sessionToken: string,
  systemPrompt: string,
  history: ChatMsg[],
  userMessage: string,
): Promise<string> {
  const browser = await getHeadlessBrowser();

  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    locale: "en-US",
    extraHTTPHeaders: { "Accept-Language": "en-US,en;q=0.9" },
  });

  try {
    // Inject session cookie — browser pakai cookie ini untuk autentikasi
    await context.addCookies([
      {
        name: "__Secure-next-auth.session-token",
        value: sessionToken,
        domain: ".openai.com",
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "None",
      },
    ]);

    const page = await context.newPage();
    page.setDefaultTimeout(90_000); // max 90 detik per operasi Playwright
    // Navigate ke chatgpt.com supaya browser punya session yang valid
    await page.goto("https://chatgpt.com/", {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });

    // Ambil access token dari dalam browser context (same-origin, tidak diblokir)
    const accessToken: string | null = await page.evaluate(async () => {
      try {
        const res = await fetch("/api/auth/session", { credentials: "include" });
        const d = await res.json();
        return d?.accessToken ?? null;
      } catch {
        return null;
      }
    });

    if (!accessToken) {
      throw new Error(
        "Session ChatGPT tidak valid atau sudah expired. Perbarui token di menu AI → Koneksi Tanpa API Key.",
      );
    }

    // Susun pesan — sistem + history + pesan baru
    const msgs = [
      ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
      ...history,
      { role: "user", content: userMessage },
    ];

    // Panggil ChatGPT API dari dalam browser context (Cloudflare tidak blokir)
    const reply: string = await page.evaluate(
      async ({ token, msgs }: { token: string; msgs: ChatMsg[] }) => {
        const res = await fetch("/backend-api/conversation", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            Accept: "text/event-stream",
          },
          credentials: "include",
          body: JSON.stringify({
            action: "next",
            messages: msgs.map((m) => ({
              id: (crypto as Crypto).randomUUID(),
              author: { role: m.role },
              content: { content_type: "text", parts: [m.content] },
            })),
            model: "gpt-4o",
            stream: true,
            timezone_offset_min: -420,
          }),
        });

        if (!res.ok) {
          const txt = await res.text();
          throw new Error(`ChatGPT ${res.status}: ${txt.slice(0, 200)}`);
        }

        // Parse SSE stream
        const reader = res.body!.getReader();
        const dec = new TextDecoder();
        let finalText = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = dec.decode(value, { stream: true });
          for (const line of chunk.split("\n")) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (data === "[DONE]") break;
            try {
              const parsed = JSON.parse(data);
              const parts = parsed?.message?.content?.parts;
              if (Array.isArray(parts) && typeof parts[0] === "string") {
                finalText = parts[0];
              }
            } catch {
              // skip malformed chunks
            }
          }
        }

        return finalText;
      },
      { token: accessToken, msgs },
    );

    if (!reply) throw new Error("Balasan ChatGPT kosong");
    return reply.trim();
  } finally {
    await context.close();
  }
}

// ─── ChatGPT (unofficial — session token dari browser, server-side fetch) ────

async function getChatGptAccessToken(sessionToken: string): Promise<string> {
  const res = await fetch("https://chatgpt.com/api/auth/session", {
    headers: {
      Cookie: `__Secure-next-auth.session-token=${sessionToken}`,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
  });
  if (!res.ok) throw new Error(`ChatGPT session gagal: HTTP ${res.status}`);
  const data = await res.json().catch(() => ({}));
  if (!data.accessToken) throw new Error("Session token tidak valid atau sudah kadaluarsa. Perbarui token dari browser.");
  return data.accessToken as string;
}

export async function callChatGptBridge(
  sessionToken: string,
  systemPrompt: string,
  history: ChatMsg[],
  userMessage: string,
): Promise<string> {
  // Kalau token sudah berupa JWT (access token dari Console), pakai langsung
  // Kalau berupa session token (panjang, dari cookie), tukar dulu
  const isJwt = sessionToken.startsWith("eyJ");
  const accessToken = isJwt ? sessionToken : await getChatGptAccessToken(sessionToken);

  const messages = [
    ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
    ...history,
    { role: "user", content: userMessage },
  ];

  const res = await fetch("https://chatgpt.com/backend-api/conversation", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
    body: JSON.stringify({
      action: "next",
      messages: messages.map((m) => ({
        id: crypto.randomUUID(),
        author: { role: m.role },
        content: { content_type: "text", parts: [m.content] },
      })),
      model: "gpt-4o",
      timezone_offset_min: -420,
      stream: false,
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    if (res.status === 401) throw new Error("Token ChatGPT kadaluarsa. Perbarui session token.");
    throw new Error(`ChatGPT error ${res.status}: ${t.slice(0, 200)}`);
  }

  const data = await res.json().catch(() => ({}));
  // format response ChatGPT web API
  const parts = data?.message?.content?.parts;
  if (Array.isArray(parts) && parts.length > 0) return String(parts[0]).trim();
  // fallback format lama
  const choices = data?.choices;
  if (Array.isArray(choices) && choices[0]?.message?.content) return String(choices[0].message.content).trim();
  throw new Error("Respons ChatGPT tidak dikenali. Mungkin format API berubah.");
}

// ─── Claude (via Claude Code CLI subprocess) ──────────────────────────────────

export async function callClaudeBridge(
  systemPrompt: string,
  history: ChatMsg[],
  userMessage: string,
): Promise<string> {
  // Susun konteks sebagai satu prompt teks (claude CLI tidak support multi-turn via flag)
  const ctxLines: string[] = [];
  if (systemPrompt) ctxLines.push(`[INSTRUKSI SISTEM]\n${systemPrompt}\n`);
  for (const m of history) {
    if (m.role === "user") ctxLines.push(`Pelanggan: ${m.content}`);
    else if (m.role === "assistant") ctxLines.push(`CS: ${m.content}`);
  }
  ctxLines.push(`Pelanggan: ${userMessage}`);
  ctxLines.push("CS:");

  const fullPrompt = ctxLines.join("\n");

  // Tulis prompt ke file temp lalu redirect via shell — lebih andal dari pipe stdin
  const claudePath = "/root/.npm-global/bin/claude";
  const tmpFile = join(tmpdir(), `claude-${Date.now()}.txt`);
  writeFileSync(tmpFile, fullPrompt, "utf8");

  return new Promise((resolve, reject) => {
    execFile(
      "/bin/bash",
      ["-c", `${claudePath} --print --output-format text < ${tmpFile}`],
      {
        timeout: 90_000,
        maxBuffer: 10 * 1024 * 1024,
        env: { ...process.env, HOME: "/root", PATH: `/root/.npm-global/bin:${process.env.PATH ?? ""}` },
      },
      (err, stdout, stderr) => {
        try { unlinkSync(tmpFile); } catch {}
        if (err && !stdout.trim()) {
          const msg = stderr?.slice(0, 300) || err.message.slice(0, 300);
          reject(new Error(`Claude CLI error: ${msg}`));
        } else {
          resolve(stdout.trim());
        }
      },
    );
  });
}

// ─── Gemini (official free API) ───────────────────────────────────────────────

export async function callGeminiBridge(
  apiKey: string,
  systemPrompt: string,
  history: ChatMsg[],
  userMessage: string,
): Promise<string> {
  const contents = [
    ...history.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    })),
    { role: "user", parts: [{ text: userMessage }] },
  ];

  const body: Record<string, unknown> = { contents };
  if (systemPrompt) body.systemInstruction = { parts: [{ text: systemPrompt }] };

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );

  if (!res.ok) {
    const t = await res.text();
    if (res.status === 400 && t.includes("API_KEY")) throw new Error("Gemini API key tidak valid.");
    throw new Error(`Gemini error ${res.status}: ${t.slice(0, 200)}`);
  }

  const data = await res.json().catch(() => ({}));
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Respons Gemini kosong.");
  return String(text).trim();
}

// ─── Deepseek (OpenAI-compatible, murah) ─────────────────────────────────────

export async function callDeepseekBridge(
  apiKey: string,
  systemPrompt: string,
  history: ChatMsg[],
  userMessage: string,
): Promise<string> {
  const messages: ChatMsg[] = [
    ...(systemPrompt ? [{ role: "system" as const, content: systemPrompt }] : []),
    ...history,
    { role: "user", content: userMessage },
  ];

  const res = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model: "deepseek-chat", messages, temperature: 0.7 }),
  });

  if (!res.ok) {
    const t = await res.text();
    if (res.status === 401) throw new Error("Deepseek API key tidak valid.");
    throw new Error(`Deepseek error ${res.status}: ${t.slice(0, 200)}`);
  }

  const data = await res.json().catch(() => ({}));
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("Respons Deepseek kosong.");
  return String(content).trim();
}

// ─── Codex CLI (ChatGPT Plus via subprocess) ─────────────────────────────────

export async function callCodexBridge(
  systemPrompt: string,
  history: ChatMsg[],
  userMessage: string,
): Promise<string> {
  const { callCodexExec } = await import("@/lib/codex-exec");

  // Susun konteks sebagai satu prompt teks — mirip callClaudeBridge
  const ctxLines: string[] = [];
  if (systemPrompt) ctxLines.push(`[INSTRUKSI SISTEM]\n${systemPrompt}\n`);
  for (const m of history) {
    if (m.role === "user") ctxLines.push(`Pelanggan: ${m.content}`);
    else if (m.role === "assistant") ctxLines.push(`CS: ${m.content}`);
  }
  ctxLines.push(`Pelanggan: ${userMessage}`);
  ctxLines.push("CS (jawab langsung, singkat, ramah, tanpa tanda kutip, tanpa label 'CS:'):");

  const fullPrompt = ctxLines.join("\n");
  const raw = await callCodexExec(fullPrompt);

  // Codex mungkin menyertakan label seperti "CS:" atau prefix lain — bersihkan
  return raw.replace(/^(CS\s*:|Asisten\s*:|Bot\s*:)\s*/i, "").trim();
}

// ─── Router utama ─────────────────────────────────────────────────────────────

export async function callBridge(
  settings: {
    bridgeProvider: string;
    bridgeChatGptToken?: string | null;
    bridgeGeminiKey?: string | null;
    bridgeDeepseekKey?: string | null;
  },
  systemPrompt: string,
  history: ChatMsg[],
  userMessage: string,
): Promise<string> {
  switch (settings.bridgeProvider) {
    case "chatgpt": {
      if (!settings.bridgeChatGptToken?.trim())
        throw new Error("Session token ChatGPT belum diatur. Sambungkan ChatGPT di menu AI → Koneksi Tanpa API Key.");
      // Pakai headless browser supaya bypass Cloudflare bot protection
      return callChatGptHeadless(settings.bridgeChatGptToken, systemPrompt, history, userMessage);
    }
    case "claude": {
      return callClaudeBridge(systemPrompt, history, userMessage);
    }
    case "gemini": {
      if (!settings.bridgeGeminiKey?.trim())
        throw new Error("Gemini API key belum diatur.");
      return callGeminiBridge(settings.bridgeGeminiKey, systemPrompt, history, userMessage);
    }
    case "deepseek": {
      if (!settings.bridgeDeepseekKey?.trim())
        throw new Error("Deepseek API key belum diatur.");
      return callDeepseekBridge(settings.bridgeDeepseekKey, systemPrompt, history, userMessage);
    }
    case "codex": {
      return callCodexBridge(systemPrompt, history, userMessage);
    }
    default:
      throw new Error(`Provider bridge tidak dikenal: ${settings.bridgeProvider}`);
  }
}
