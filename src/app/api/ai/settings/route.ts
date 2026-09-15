import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { getAiSettings } from "@/lib/ai";
import { DEFAULT_WORKDAYS } from "@/lib/chatrules";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const s = await getAiSettings();
  return NextResponse.json({
    settings: {
      enabled: s.enabled,
      provider: s.provider,
      apiBaseUrl: s.apiBaseUrl ?? "",
      hasApiKey: !!s.apiKey,
      model: s.model,
      temperature: s.temperature,
      systemPrompt: s.systemPrompt ?? "",
      wordFilter: s.wordFilter,
      workHoursEnabled: s.workHoursEnabled,
      workTimezone: s.workTimezone,
      workDays: Array.isArray(s.workDays) ? s.workDays : DEFAULT_WORKDAYS,
      outsideMessage: s.outsideMessage ?? "",
      escalationKeywords: s.escalationKeywords,
      escalationMessage: s.escalationMessage ?? "",
      // Draft mode & jam aktif
      draftMode: s.draftMode,
      alwaysActive: s.alwaysActive,
      // Aturan perilaku
      alwaysRules: s.alwaysRules,
      neverRules: s.neverRules,
      // Saran jawaban
      suggestEnabled: s.suggestEnabled,
      suggestSystemPrompt: s.suggestSystemPrompt ?? "",
      // CLI Bridge
      bridgeEnabled: s.bridgeEnabled,
      bridgeProvider: s.bridgeProvider,
      hasBridgeChatGptToken: !!s.bridgeChatGptToken,
      hasBridgeGeminiKey: !!s.bridgeGeminiKey,
      hasBridgeDeepseekKey: !!s.bridgeDeepseekKey,
    },
  });
}

export async function PUT(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(session.role, "manage_ai"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  await getAiSettings(); // pastikan ada

  const toWords = (v: unknown) =>
    Array.isArray(v) ? v.map((w) => String(w).trim()).filter(Boolean) : [];

  // partial update — tiap tab boleh kirim subset
  const data: Record<string, unknown> = {};
  if ("enabled" in body) data.enabled = !!body.enabled;
  if ("provider" in body) data.provider = body.provider === "platform" ? "platform" : "byok";
  if ("apiBaseUrl" in body) data.apiBaseUrl = (body.apiBaseUrl ?? "").toString().trim() || null;
  if ("model" in body) data.model = (body.model ?? "gpt-4o-mini").toString().trim() || "gpt-4o-mini";
  if ("temperature" in body) data.temperature = Math.max(0, Math.min(2, Number(body.temperature) || 0.7));
  if ("systemPrompt" in body) data.systemPrompt = (body.systemPrompt ?? "").toString() || null;
  if ("wordFilter" in body) data.wordFilter = toWords(body.wordFilter);
  if (typeof body.apiKey === "string" && body.apiKey.trim()) data.apiKey = body.apiKey.trim();
  // jam kerja
  if ("workHoursEnabled" in body) data.workHoursEnabled = !!body.workHoursEnabled;
  if ("workTimezone" in body) data.workTimezone = (body.workTimezone ?? "Asia/Jakarta").toString();
  if ("workDays" in body && Array.isArray(body.workDays)) data.workDays = body.workDays;
  if ("outsideMessage" in body) data.outsideMessage = (body.outsideMessage ?? "").toString() || null;
  // eskalasi
  if ("escalationKeywords" in body) data.escalationKeywords = toWords(body.escalationKeywords);
  if ("escalationMessage" in body) data.escalationMessage = (body.escalationMessage ?? "").toString() || null;
  // draft mode & jam aktif
  if ("draftMode" in body) data.draftMode = !!body.draftMode;
  if ("alwaysActive" in body) data.alwaysActive = !!body.alwaysActive;
  // aturan perilaku
  if ("alwaysRules" in body) data.alwaysRules = toWords(body.alwaysRules);
  if ("neverRules" in body) data.neverRules = toWords(body.neverRules);
  // saran jawaban
  if ("suggestEnabled" in body) data.suggestEnabled = !!body.suggestEnabled;
  if ("suggestSystemPrompt" in body) data.suggestSystemPrompt = (body.suggestSystemPrompt ?? "").toString() || null;
  // CLI bridge
  if ("bridgeEnabled" in body) data.bridgeEnabled = !!body.bridgeEnabled;
  if ("bridgeProvider" in body) data.bridgeProvider = ["chatgpt","claude","gemini","deepseek","codex"].includes(String(body.bridgeProvider)) ? String(body.bridgeProvider) : "chatgpt";
  if (typeof body.bridgeChatGptToken === "string" && body.bridgeChatGptToken.trim()) data.bridgeChatGptToken = body.bridgeChatGptToken.trim();
  if (body.bridgeChatGptToken === "") data.bridgeChatGptToken = null;
  if (typeof body.bridgeGeminiKey === "string" && body.bridgeGeminiKey.trim()) data.bridgeGeminiKey = body.bridgeGeminiKey.trim();
  if (body.bridgeGeminiKey === "") data.bridgeGeminiKey = null;
  if (typeof body.bridgeDeepseekKey === "string" && body.bridgeDeepseekKey.trim()) data.bridgeDeepseekKey = body.bridgeDeepseekKey.trim();
  if (body.bridgeDeepseekKey === "") data.bridgeDeepseekKey = null;

  await prisma.aiSettings.update({ where: { id: "singleton" }, data });
  return NextResponse.json({ ok: true });
}
