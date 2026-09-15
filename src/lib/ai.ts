import { prisma } from "@/lib/db";
import { callBridge } from "@/lib/ai-bridge";

export async function getAiSettings() {
  let s = await prisma.aiSettings.findUnique({ where: { id: "singleton" } });
  if (!s) {
    s = await prisma.aiSettings.create({ data: { id: "singleton" } });
  }
  return s;
}

type ChatMsg = { role: "system" | "user" | "assistant"; content: string };

function endpoint(base: string) {
  return base.replace(/\/$/, "") + "/chat/completions";
}

async function callLLM(
  settings: Awaited<ReturnType<typeof getAiSettings>>,
  messages: ChatMsg[],
) {
  const base =
    settings.provider === "platform"
      ? process.env.AI_PLATFORM_BASE_URL || "https://api.openai.com/v1"
      : settings.apiBaseUrl || "https://api.openai.com/v1";
  const key =
    settings.provider === "platform" ? process.env.AI_PLATFORM_KEY : settings.apiKey;
  if (!key) throw new Error("API key AI belum diatur");

  const res = await fetch(endpoint(base), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: settings.model,
      temperature: settings.temperature,
      messages,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`AI error ${res.status}: ${t.slice(0, 300)}`);
  }
  const data = await res.json();
  return (data.choices?.[0]?.message?.content ?? "").trim();
}

export async function buildSystemPrompt(
  settings: Awaited<ReturnType<typeof getAiSettings>>,
) {
  const [kb, qa, flowSteps] = await Promise.all([
    prisma.knowledgeBase.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.qaPair.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.conversationFlow.findMany({ where: { isActive: true }, orderBy: { order: "asc" } }),
  ]);

  const kbText = kb.map((k) => `# ${k.title}\n${k.content}`).join("\n\n");
  const qaText = qa.map((q) => `T: ${q.question}\nJ: ${q.answer}`).join("\n\n");

  const persona =
    settings.systemPrompt?.trim() ||
    "Kamu adalah asisten customer service yang ramah, singkat, dan membantu. Jawab dalam Bahasa Indonesia.";

  // Aturan ALWAYS / NEVER
  const alwaysText = settings.alwaysRules?.length
    ? `\nSELALU lakukan ini:\n${settings.alwaysRules.map((r) => `- ${r}`).join("\n")}`
    : "";
  const neverText = settings.neverRules?.length
    ? `\nJANGAN PERNAH lakukan ini:\n${settings.neverRules.map((r) => `- ${r}`).join("\n")}`
    : "";

  // Kompilasi alur CS ke dalam instruksi sistem
  let flowText = "";
  if (flowSteps.length > 0) {
    const lines: string[] = ["=== ALUR PERCAKAPAN ===", "Ikuti alur berikut saat membalas pelanggan:\n"];
    flowSteps.forEach((s, i) => {
      if (s.stepType === "greeting") {
        lines.push(`SALAM PEMBUKA (step ${i + 1} - "${s.name}"):`);
        lines.push(`Saat pertama kali membalas pelanggan baru, mulai dengan: "${s.message}"`);
        if (s.mediaUrl) lines.push(`[Sertakan info: foto/dokumen tersedia di ${s.mediaUrl}]`);
      } else if (s.stepType === "keyword") {
        const kws = s.keywords.join(", ");
        lines.push(`KONDISI (step ${i + 1} - "${s.name}"):`);
        lines.push(`Jika pelanggan menyebut salah satu kata: [${kws}]`);
        lines.push(`→ Balas dengan: "${s.message}"`);
        if (s.mediaUrl) lines.push(`→ Informasikan bahwa foto/dokumen tersedia di: ${s.mediaUrl}`);
      } else if (s.stepType === "fallback") {
        lines.push(`PESAN DEFAULT (step ${i + 1} - "${s.name}"):`);
        lines.push(`Jika tidak ada kondisi yang cocok, gunakan: "${s.message}"`);
      }
      lines.push("");
    });
    flowText = lines.join("\n");
  }

  return `${persona}${alwaysText}${neverText}

Gunakan INFORMASI di bawah untuk menjawab pertanyaan pelanggan. Kalau informasi tidak cukup, minta pelanggan menunggu admin dan jangan mengarang.

${flowText}
=== PENGETAHUAN ===
${kbText || "(belum ada)"}

=== TANYA-JAWAB ===
${qaText || "(belum ada)"}`;
}

// Balas untuk 1 pesan. history opsional (percakapan sebelumnya).
export async function generateAiReply(
  userMessage: string,
  history: ChatMsg[] = [],
): Promise<string> {
  const settings = await getAiSettings();
  const system = await buildSystemPrompt(settings);

  // Pakai CLI Bridge jika aktif
  if (settings.bridgeEnabled) {
    return callBridge(settings, system, history, userMessage);
  }

  // Fallback: API key langsung
  const messages: ChatMsg[] = [
    { role: "system", content: system },
    ...history,
    { role: "user", content: userMessage },
  ];
  return callLLM(settings, messages);
}

// Dipakai mesin inbox: balas otomatis kalau AI aktif & lolos filter.
// Cek keyword flow steps dulu (rule-based), baru fallback ke AI.
// Return: { text, draft } — null berarti tidak ada balasan.
export async function maybeAutoAiReply(
  userMessage: string,
): Promise<{ text: string; draft: boolean } | null> {
  const settings = await getAiSettings();
  if (!settings.enabled) return null;

  const t = userMessage.toLowerCase();
  if (settings.wordFilter.some((w) => w.trim() && t.includes(w.trim().toLowerCase())))
    return null;

  try {
    // Cek keyword flow steps — rule-based, lebih cepat dari AI
    const flowSteps = await prisma.conversationFlow.findMany({
      where: { isActive: true, stepType: "keyword" },
      orderBy: { order: "asc" },
    });

    for (const step of flowSteps) {
      const matched = step.keywords.some((kw) => kw.trim() && t.includes(kw.trim().toLowerCase()));
      if (matched) {
        // Rule match: langsung balas tanpa panggil AI
        const text = step.mediaUrl
          ? `${step.message}\n\n${step.mediaUrl}`
          : step.message;
        return { text, draft: settings.draftMode };
      }
    }

    // Tidak ada rule yang cocok — panggil AI (dengan flow di system prompt)
    const text = await generateAiReply(userMessage);
    if (!text) return null;
    return { text, draft: settings.draftMode };
  } catch {
    return null;
  }
}
