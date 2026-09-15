import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getAiSettings } from "@/lib/ai";
import { callBridge } from "@/lib/ai-bridge";

export const dynamic = "force-dynamic";

const DEFAULT_PROMPT =
  "Kamu membantu agent customer service menyusun balasan yang tepat, singkat, dan ramah dalam Bahasa Indonesia. " +
  "Berdasarkan riwayat percakapan berikut, berikan 1 saran jawaban terbaik untuk membalas pesan terakhir dari lead. " +
  "Tulis langsung teks balasannya saja, tanpa label, tanpa tanda kutip, tanpa penjelasan tambahan.";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id: conversationId } = await params;

  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: {
      aiPaused: true,
      customer: { select: { name: true, phone: true } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 15,
        select: { direction: true, text: true },
      },
    },
  });

  if (!conv) return NextResponse.json({ error: "not found" }, { status: 404 });

  const settings = await getAiSettings();
  if (!settings.suggestEnabled)
    return NextResponse.json({ error: "Fitur saran jawaban dimatikan." }, { status: 403 });

  // Susun riwayat (urut dari lama ke baru)
  const history = [...conv.messages].reverse();
  const historyText = history
    .filter((m) => m.text?.trim())
    .map((m) => `${m.direction === "IN" ? "Lead" : "Agent"}: ${m.text!.trim()}`)
    .join("\n");

  const systemPrompt =
    settings.suggestSystemPrompt?.trim() || DEFAULT_PROMPT;

  const userPrompt = `Riwayat percakapan:\n${historyText || "(belum ada pesan)"}\n\nSaran jawaban terbaik:`;

  let suggestion: string;
  try {
    if (settings.bridgeEnabled) {
      suggestion = await callBridge(settings, systemPrompt, [], userPrompt);
    } else {
      const key =
        settings.provider === "platform"
          ? process.env.AI_PLATFORM_KEY
          : settings.apiKey;
      if (!key) return NextResponse.json({ error: "API key AI belum diatur." }, { status: 422 });

      const base =
        (settings.provider === "platform"
          ? process.env.AI_PLATFORM_BASE_URL
          : settings.apiBaseUrl) || "https://api.openai.com/v1";

      const res = await fetch(base.replace(/\/$/, "") + "/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: settings.model,
          temperature: 0.5,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`AI error ${res.status}: ${t.slice(0, 200)}`);
      }
      const data = await res.json();
      suggestion = (data.choices?.[0]?.message?.content ?? "").trim();
    }
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }

  return NextResponse.json({ suggestion });
}
