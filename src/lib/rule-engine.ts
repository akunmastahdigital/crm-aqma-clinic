import { prisma } from "@/lib/db";
import { sendCapiEvent } from "@/lib/meta-capi";

type RuleCondition = {
  type: "keyword" | "purchase_regex" | "label" | "status" | "msg_count" | "on_page_view" | "on_link_click" | "ctwa_first_message";
  operator?: string;
  value: string;
};
type RuleAction = {
  type: "send_capi_event" | "set_meta_status";
  eventName?: string;
  extractValue?: boolean;
  oneTime?: boolean;
  status?: string;
};
type RunOpts = { customerId: string; conversationId: string; text: string; ctwaAdId?: string };

function evalCondition(cond: RuleCondition, opts: RunOpts & { tags: string[]; convStatus: string; msgCount: number }): boolean {
  const { type, value } = cond;
  const text = opts.text.toLowerCase();
  if (type === "keyword") return text.includes(value.toLowerCase());
  if (type === "purchase_regex") return /[Rr][Pp]\.?\s*([\d.,]+)/.test(opts.text);
  if (type === "label") return opts.tags.includes(value);
  if (type === "status") return opts.convStatus === value;
  if (type === "msg_count") return opts.msgCount >= parseInt(value || "0", 10);
  if (type === "ctwa_first_message") {
    if (!opts.ctwaAdId) return false;
    return !value || value === "*" || value === opts.ctwaAdId;
  }
  return false;
}

function extractRpValue(text: string): number | undefined {
  const m = text.match(/[Rr][Pp]\.?\s*([\d.,]+)/);
  if (!m) return undefined;
  return parseFloat(m[1].replace(/\./g, "").replace(",", "."));
}

export async function runRules(opts: RunOpts) {
  try {
    const rules = await prisma.crmRule.findMany({ where: { isActive: true }, orderBy: { createdAt: "asc" } });
    if (!rules.length) return;

    const customer = await prisma.customer.findUnique({
      where: { id: opts.customerId },
      select: { phone: true, email: true, name: true, tags: true },
    });
    if (!customer) return;

    const conv = await prisma.conversation.findUnique({
      where: { id: opts.conversationId },
      select: { status: true, _count: { select: { messages: true } } },
    });

    const tags: string[] = customer.tags || [];
    const convStatus = conv?.status || "OPEN";
    const msgCount = conv?._count?.messages || 0;

    // First-touch attribution: ambil session pertama customer
    const firstSession = await prisma.clickSession.findFirst({
      where: { customerId: opts.customerId },
      orderBy: { createdAt: "asc" },
      select: { code: true, fbclid: true, campaignId: true, adsetId: true, adId: true, fbp: true },
    });

    for (const rule of rules) {
      const conditions = rule.conditions as RuleCondition[];
      const actions = rule.actions as RuleAction[];

      const allMet = conditions.every(cond =>
        evalCondition(cond, { ...opts, tags, convStatus, msgCount })
      );
      if (!allMet) continue;

      for (const action of actions) {
        if (action.type === "send_capi_event") {
          const eventName = action.eventName || "Lead";
          const value = action.extractValue ? extractRpValue(opts.text) : undefined;
          // One-time per customer: skip jika event ini sudah pernah dikirim
          if (action.oneTime) {
            const alreadySent = await prisma.capiEvent.findFirst({
              where: { customerId: opts.customerId, eventName },
            });
            if (alreadySent) continue;
          }
          // CTWA sessions punya kode "C-XXXXX", LP sessions punya "T-XXXXX"
          const isCtwa = firstSession?.code?.startsWith("C-") ?? false;
          void sendCapiEvent({
            eventName,
            customerId: opts.customerId,
            phone: customer.phone || undefined,
            email: customer.email || undefined,
            name: customer.name || undefined,
            fbclid: firstSession?.fbclid ?? null,
            isCtwa,
            fbp: isCtwa ? null : (firstSession?.fbp ?? null),
            campaignId: firstSession?.campaignId ?? null,
            adsetId: firstSession?.adsetId ?? null,
            adId: firstSession?.adId ?? null,
            value,
          });
        } else if (action.type === "set_meta_status" && action.status) {
          await prisma.customer.update({
            where: { id: opts.customerId },
            data: { metaEventStatus: action.status },
          });
        }
      }

      await prisma.crmRule.update({
        where: { id: rule.id },
        data: { runCount: { increment: 1 }, lastRunAt: new Date() },
      });
    }
  } catch (err) {
    console.error("[runRules]", err);
  }
}

// ============================================================
// Snippet Rules — triggered by LP pageview or link click
// ============================================================

type SnippetTrigger = "on_page_view" | "on_link_click";

type SnippetData = {
  fbclid?: string | null;
  fbp?: string | null;
  campaignId?: string | null;
  adsetId?: string | null;
  adId?: string | null;
  campaignName?: string | null;
  adsetName?: string | null;
  adName?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  clientIpAddress?: string | null;
  clientUserAgent?: string | null;
};

export async function runSnippetRules(
  trigger: SnippetTrigger,
  slug: string,
  data: SnippetData
) {
  try {
    const rules = await prisma.crmRule.findMany({ where: { isActive: true }, orderBy: { createdAt: "asc" } });
    if (!rules.length) return;

    for (const rule of rules) {
      const conditions = rule.conditions as RuleCondition[];
      const actions = rule.actions as RuleAction[];

      // Rule ini adalah snippet rule jika semua kondisinya on_page_view / on_link_click
      const isSnippetRule = conditions.length > 0 &&
        conditions.every(c => c.type === "on_page_view" || c.type === "on_link_click");
      if (!isSnippetRule) continue;

      // Semua kondisi harus terpenuhi
      const allMet = conditions.every(c => {
        if (c.type !== trigger) return false;
        // value kosong atau "*" = cocok semua slug
        return !c.value || c.value === "*" || c.value === slug;
      });
      if (!allMet) continue;

      for (const action of actions) {
        if (action.type === "send_capi_event") {
          void sendCapiEvent({
            eventName: action.eventName || "ViewContent",
            actionSource: "website",
            fbclid: data.fbclid ?? null,
            fbp: data.fbp ?? null,
            campaignId: data.campaignId ?? null,
            adsetId: data.adsetId ?? null,
            adId: data.adId ?? null,
            clientIpAddress: data.clientIpAddress ?? null,
            clientUserAgent: data.clientUserAgent ?? null,
          });
        }
      }

      await prisma.crmRule.update({
        where: { id: rule.id },
        data: { runCount: { increment: 1 }, lastRunAt: new Date() },
      });
    }
  } catch (err) {
    console.error("[runSnippetRules]", err);
  }
}
