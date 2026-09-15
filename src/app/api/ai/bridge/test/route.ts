import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getAiSettings } from "@/lib/ai";
import { callBridge } from "@/lib/ai-bridge";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { provider, chatGptToken, geminiKey, deepseekKey } = body as {
    provider?: string;
    chatGptToken?: string;
    geminiKey?: string;
    deepseekKey?: string;
  };

  if (!provider) return NextResponse.json({ error: "provider wajib diisi" }, { status: 400 });

  // Ambil token tersimpan dari DB sebagai fallback
  const stored = await getAiSettings();

  try {
    const reply = await callBridge(
      {
        bridgeProvider: provider,
        bridgeChatGptToken: chatGptToken?.trim() || stored.bridgeChatGptToken,
        bridgeGeminiKey:    geminiKey?.trim()    || stored.bridgeGeminiKey,
        bridgeDeepseekKey:  deepseekKey?.trim()  || stored.bridgeDeepseekKey,
      },
      "Kamu asisten CS. Jawab singkat dalam Bahasa Indonesia.",
      [],
      "Halo, ini tes koneksi. Balas dengan: Koneksi berhasil!",
    );
    return NextResponse.json({ ok: true, reply });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 422 });
  }
}
