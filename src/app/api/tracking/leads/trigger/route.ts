import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendCapiEvent } from "@/lib/meta-capi";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { customerId, eventName, value } = body as {
      customerId?: string;
      eventName?: string;
      value?: number;
    };

    if (!customerId || !eventName) {
      return NextResponse.json({ error: "customerId & eventName wajib" }, { status: 400 });
    }

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, phone: true, email: true, name: true, tags: true },
    });
    if (!customer) return NextResponse.json({ error: "customer not found" }, { status: 404 });

    const session = await prisma.clickSession.findFirst({
      where: { customerId },
      orderBy: { createdAt: "desc" },
      select: { code: true, fbclid: true, fbp: true, ip: true, userAgent: true },
    });
    const isCtwa = session?.code?.startsWith("C-") ?? false;

    // Derive event->label mapping from CRM rules
    const rules = await prisma.crmRule.findMany({
      where: { isActive: true },
      select: { actions: true },
    });

    type Action = { type: string; value: string };
    type RuleRaw = { actions: unknown };
    const eventLabelMap: Record<string, string> = {};
    const allMappedLabels: string[] = [];

    for (const rule of rules as RuleRaw[]) {
      const acts = (rule.actions as Action[]) ?? [];
      const capiAction = acts.find(a => a.type === "capi_event");
      const labelAction = acts.find(a => a.type === "label");
      if (capiAction && labelAction) {
        eventLabelMap[capiAction.value] = labelAction.value;
        allMappedLabels.push(labelAction.value);
      }
    }

    // sendCapiEvent handles capi_events logging internally
    const result = await sendCapiEvent({
      eventName,
      eventId: "manual-" + Date.now() + "-" + customerId.slice(-4),
      customerId,
      phone: customer.phone ?? undefined,
      email: customer.email ?? undefined,
      name: customer.name ?? undefined,
      fbclid: session?.fbclid ?? undefined,
      isCtwa,
      fbp: isCtwa ? undefined : (session?.fbp ?? undefined),
      value: value ?? undefined,
      currency: value ? "IDR" : undefined,
      clientIpAddress: isCtwa ? undefined : (session?.ip ?? undefined),
      clientUserAgent: isCtwa ? undefined : (session?.userAgent ?? undefined),
    });

    // Update label if mapping exists
    let labelSet: string | null = null;
    if (eventLabelMap[eventName]) {
      const newLabel = eventLabelMap[eventName];
      const currentTags: string[] = Array.isArray(customer.tags) ? customer.tags as string[] : [];
      const filtered = currentTags.filter(t => !allMappedLabels.includes(t));
      if (!filtered.includes(newLabel)) filtered.push(newLabel);
      await prisma.customer.update({
        where: { id: customerId },
        data: { tags: filtered },
      });
      labelSet = newLabel;
    }

    const ok = result?.status === "sent";
    return NextResponse.json({ ok, capiStatus: result, labelSet });
  } catch (e) {
    console.error("[trigger]", e);
    return NextResponse.json({ error: "server error" }, { status: 500 });
  }
}
