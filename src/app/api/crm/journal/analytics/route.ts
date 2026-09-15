import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const from = sp.get("from") ?? new Date(Date.now() - 30 * 86_400_000).toISOString().split("T")[0];
  const to = sp.get("to") ?? new Date().toISOString().split("T")[0];
  const userId = session.role === "AGENT" ? session.uid : (sp.get("userId") ?? undefined);

  const fromDt = new Date(from + "T00:00:00+07:00");
  const toDt = new Date(to + "T23:59:59+07:00");

  const baseWhere: Record<string, unknown> = {
    date: { gte: fromDt, lte: toDt },
    ...(userId ? { userId } : {}),
  };

  type ClosingDef = { useLabel: boolean; labels: string[]; useStage: boolean; stages: string[] };

  // Load closing definitions from settings
  const [closingSetting, failDefineSetting] = await Promise.all([
    prisma.crmSetting.findUnique({ where: { key: "closing_definition" } }),
    prisma.crmSetting.findUnique({ where: { key: "fail_closing_labels" } }),
  ]);

  const closingDef: ClosingDef = closingSetting
    ? (() => { try { return JSON.parse(closingSetting.value) as ClosingDef; } catch { return { useLabel: false, labels: [], useStage: false, stages: [] }; } })()
    : { useLabel: false, labels: [], useStage: false, stages: [] };
  const closingLabels: string[] = closingDef.useLabel ? closingDef.labels : [];
  const failLabels: string[] = failDefineSetting
    ? (() => { try { return JSON.parse(failDefineSetting.value) as string[]; } catch { return []; } })()
    : [];

  // 1. All journal entries in period
  const allJournals = await prisma.salesJournal.findMany({
    where: baseWhere,
    include: { user: { select: { id: true, name: true } } },
  });

  // 2. Closing rate
  // Source of truth: Customer.closedAt (diset oleh checkAndMarkClosing saat label closing di-assign)
  // Bukan dari journal entries, karena label bisa diubah tanpa membuat jurnal
  const totalLeads = new Set(allJournals.map((j) => j.customerId)).size;
  const closingCount = await prisma.customer.count({
    where: {
      closedAt: { gte: fromDt, lte: toDt },
      ...(userId ? { salesJournals: { some: { userId } } } : {}),
    },
  });
  const failCustomers = new Set(
    allJournals.filter((j) => j.isClosingFail || (failLabels.length > 0 && failLabels.includes(j.label ?? ""))).map((j) => j.customerId)
  ).size;
  const closingCustomers = closingCount;
  const closingRate = totalLeads > 0 ? Math.min(100, parseFloat(((closingCustomers / totalLeads) * 100).toFixed(2))) : 0;

  // 3. Per-PIC breakdown
  // Ambil closing per-PIC dari Customer.closedAt + assignedToId
  const closedCustomersByPic = await prisma.customer.findMany({
    where: {
      closedAt: { gte: fromDt, lte: toDt },
      assignedToId: { not: null },
    },
    select: { assignedToId: true },
  });
  const picClosingSet: Record<string, number> = {};
  for (const c of closedCustomersByPic) {
    if (c.assignedToId) picClosingSet[c.assignedToId] = (picClosingSet[c.assignedToId] ?? 0) + 1;
  }

  const perPic: Record<string, { name: string; total: number; closing: number; fail: number; customers: Set<string> }> = {};
  for (const j of allJournals) {
    if (!perPic[j.userId]) perPic[j.userId] = { name: j.user.name, total: 0, closing: 0, fail: 0, customers: new Set() };
    perPic[j.userId].total++;
    perPic[j.userId].customers.add(j.customerId);
    if (j.isClosingFail || (failLabels.length > 0 && failLabels.includes(j.label ?? ""))) perPic[j.userId].fail++;
  }
  const picTable = Object.entries(perPic).map(([uid, d]) => ({
    userId: uid,
    name: d.name,
    totalEntries: d.total,
    totalLeads: d.customers.size,
    closing: picClosingSet[uid] ?? 0,
    fail: d.fail,
    rate: d.customers.size > 0 ? Math.min(100, parseFloat((((picClosingSet[uid] ?? 0) / d.customers.size) * 100).toFixed(2))) : 0,
  })).sort((a, b) => b.totalEntries - a.totalEntries);

  // 4. Aktivitas per jenis
  const activityCount: Record<string, number> = {};
  for (const j of allJournals) {
    activityCount[j.activityType] = (activityCount[j.activityType] ?? 0) + 1;
  }
  const activityBreakdown = Object.entries(activityCount)
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);

  // 5. Efektivitas FU (Jenis FU × Respon FU)
  const fuMatrix: Record<string, Record<string, number>> = {};
  for (const j of allJournals) {
    if (!j.followUpType) continue;
    if (!fuMatrix[j.followUpType]) fuMatrix[j.followUpType] = {};
    const resp = j.followUpResponse ?? "(tidak ada respon)";
    fuMatrix[j.followUpType][resp] = (fuMatrix[j.followUpType][resp] ?? 0) + 1;
  }
  const fuEffectiveness = Object.entries(fuMatrix).map(([fuType, responses]) => ({
    fuType,
    total: Object.values(responses).reduce((a, b) => a + b, 0),
    responses: Object.entries(responses).map(([r, cnt]) => ({ response: r, count: cnt })).sort((a, b) => b.count - a.count),
  })).sort((a, b) => b.total - a.total);

  // 6. Analisa gagal closing
  const failReasons: Record<string, number> = {};
  for (const j of allJournals) {
    if (!j.isClosingFail) continue;
    const reason = j.cancelReason ?? "(tidak ada alasan)";
    failReasons[reason] = (failReasons[reason] ?? 0) + 1;
  }
  const failAnalysis = Object.entries(failReasons)
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);
  const totalFail = Object.values(failReasons).reduce((a, b) => a + b, 0);

  // 7. Time to close — ambil customer yang sudah closing dalam periode ini
  const closedCustomers = await prisma.customer.findMany({
    where: {
      closedAt: { gte: fromDt, lte: toDt },
      timeToCloseMinutes: { not: null },
      ...(userId ? { salesJournals: { some: { userId } } } : {}),
    },
    select: {
      id: true,
      closedAt: true,
      timeToCloseMinutes: true,
      assignedTo: { select: { id: true, name: true } },
    },
  });

  // 8. Kredit closing per handler (primary + secondary dari conversation_agents)
  const closedCustomerIds = closedCustomers.map((c) => c.id);
  let handlerClosingTable: { userId: string; name: string; primaryClosing: number; secondaryClosing: number; totalClosing: number }[] = [];

  if (closedCustomerIds.length > 0) {
    const handlers = await prisma.conversationAgent.findMany({
      where: {
        conversation: { customerId: { in: closedCustomerIds } },
        role: { in: ["PRIMARY", "SECONDARY"] },
        ...(userId ? { agentId: userId } : {}),
      },
      select: {
        role: true,
        agentId: true,
        agent: { select: { id: true, name: true } },
        conversation: { select: { customerId: true } },
      },
    });

    const credit: Record<string, { name: string; primary: Set<string>; secondary: Set<string> }> = {};
    for (const h of handlers) {
      if (!credit[h.agentId]) credit[h.agentId] = { name: h.agent.name, primary: new Set(), secondary: new Set() };
      if (h.role === "PRIMARY") credit[h.agentId].primary.add(h.conversation.customerId);
      else credit[h.agentId].secondary.add(h.conversation.customerId);
    }

    handlerClosingTable = Object.entries(credit).map(([uid, d]) => ({
      userId: uid,
      name: d.name,
      primaryClosing: d.primary.size,
      secondaryClosing: d.secondary.size,
      totalClosing: new Set([...d.primary, ...d.secondary]).size,
    })).sort((a, b) => b.totalClosing - a.totalClosing);
  }

  const ttcValues = closedCustomers.map((c) => c.timeToCloseMinutes!);
  const ttcAvgMinutes = ttcValues.length > 0
    ? Math.round(ttcValues.reduce((a, b) => a + b, 0) / ttcValues.length)
    : null;
  const ttcMinMinutes = ttcValues.length > 0 ? Math.min(...ttcValues) : null;
  const ttcMaxMinutes = ttcValues.length > 0 ? Math.max(...ttcValues) : null;

  const ttcBrackets = {
    lessThan1Day: ttcValues.filter((v) => v < 60 * 24).length,
    oneToThreeDays: ttcValues.filter((v) => v >= 60 * 24 && v < 60 * 24 * 3).length,
    threeToSevenDays: ttcValues.filter((v) => v >= 60 * 24 * 3 && v < 60 * 24 * 7).length,
    moreThanSevenDays: ttcValues.filter((v) => v >= 60 * 24 * 7).length,
  };

  // Per-PIC time to close
  const ttcByPic: Record<string, { name: string; values: number[] }> = {};
  for (const c of closedCustomers) {
    const pic = c.assignedTo;
    if (!pic) continue;
    if (!ttcByPic[pic.id]) ttcByPic[pic.id] = { name: pic.name, values: [] };
    ttcByPic[pic.id].values.push(c.timeToCloseMinutes!);
  }
  const ttcPerPic = Object.entries(ttcByPic).map(([uid, d]) => ({
    userId: uid,
    name: d.name,
    count: d.values.length,
    avgMinutes: Math.round(d.values.reduce((a, b) => a + b, 0) / d.values.length),
  })).sort((a, b) => a.avgMinutes - b.avgMinutes);

  // 9. Response Time: FRT (First Response Time) + ART (Average Reply Time)
  // FRT: dari firstResponseMinutes yang sudah tersimpan di conversations
  const convsWithFrt = await prisma.conversation.findMany({
    where: {
      firstResponseAt: { gte: fromDt, lte: toDt },
      firstResponseMinutes: { not: null },
      ...(userId ? { conversationAgents: { some: { agentId: userId, role: "PRIMARY" } } } : {}),
    },
    select: {
      firstResponseMinutes: true,
      conversationAgents: {
        where: { role: "PRIMARY" },
        select: { agentId: true, agent: { select: { id: true, name: true } } },
        take: 1,
      },
    },
  });

  const allFrtValues = convsWithFrt.map((c) => c.firstResponseMinutes!);
  const frtByAgent: Record<string, { name: string; values: number[] }> = {};
  for (const conv of convsWithFrt) {
    const primary = conv.conversationAgents[0];
    if (!primary) continue;
    if (!frtByAgent[primary.agentId]) frtByAgent[primary.agentId] = { name: primary.agent.name, values: [] };
    frtByAgent[primary.agentId].values.push(conv.firstResponseMinutes!);
  }
  const frtPerAgent = Object.entries(frtByAgent).map(([uid, d]) => ({
    userId: uid, name: d.name, count: d.values.length,
    avgMinutes: Math.round(d.values.reduce((a, b) => a + b, 0) / d.values.length),
    minMinutes: Math.min(...d.values),
  })).sort((a, b) => a.avgMinutes - b.avgMinutes);

  const frtBrackets = {
    under5: allFrtValues.filter((v) => v < 5).length,
    fiveTo30: allFrtValues.filter((v) => v >= 5 && v < 30).length,
    thirtyTo120: allFrtValues.filter((v) => v >= 30 && v < 120).length,
    over120: allFrtValues.filter((v) => v >= 120).length,
  };

  // ART: hitung pasangan IN → next-manual-OUT dari conversations dalam periode
  const convsForArt = await prisma.conversation.findMany({
    where: {
      lastMessageAt: { gte: fromDt, lte: toDt },
      ...(userId ? { conversationAgents: { some: { agentId: userId, role: { in: ["PRIMARY", "SECONDARY"] } } } } : {}),
    },
    select: {
      conversationAgents: {
        where: { role: { in: ["PRIMARY", "SECONDARY"] } },
        select: { agentId: true, agent: { select: { id: true, name: true } } },
      },
      messages: {
        where: { OR: [{ direction: "IN" }, { direction: "OUT", authorId: { not: null } }] },
        orderBy: { createdAt: "asc" },
        select: { direction: true, createdAt: true, authorId: true },
      },
    },
    take: 300,
  });

  const artByAgent: Record<string, { name: string; deltas: number[] }> = {};
  for (const conv of convsForArt) {
    const msgs = conv.messages;
    for (let i = 0; i < msgs.length; i++) {
      if (msgs[i].direction !== "IN") continue;
      const nextOut = msgs.slice(i + 1).find((m) => m.direction === "OUT" && m.authorId);
      if (!nextOut) continue;
      const deltaMin = Math.round((nextOut.createdAt.getTime() - msgs[i].createdAt.getTime()) / 60_000);
      if (deltaMin < 0 || deltaMin > 60 * 24 * 7) continue; // skip outlier > 7 hari
      for (const h of conv.conversationAgents) {
        if (!artByAgent[h.agentId]) artByAgent[h.agentId] = { name: h.agent.name, deltas: [] };
        artByAgent[h.agentId].deltas.push(deltaMin);
      }
    }
  }
  const artPerAgent = Object.entries(artByAgent).map(([uid, d]) => ({
    userId: uid, name: d.name, sampleCount: d.deltas.length,
    avgMinutes: d.deltas.length > 0 ? Math.round(d.deltas.reduce((a, b) => a + b, 0) / d.deltas.length) : 0,
  })).sort((a, b) => a.avgMinutes - b.avgMinutes);

  // 10. Lead belum dijurnal per agent (laporan Owner)
  // Cari conversation aktif dalam periode yang assigned ke agent, tapi tidak ada jurnal dari agent itu
  const assignedConvs = await prisma.conversation.findMany({
    where: {
      lastMessageAt: { gte: fromDt, lte: toDt },
      assignedToId: { not: null },
      ...(userId ? { assignedToId: userId } : {}),
    },
    select: {
      customerId: true,
      lastMessageAt: true,
      assignedToId: true,
      assignedTo: { select: { id: true, name: true } },
      customer: { select: { id: true, name: true, phone: true } },
    },
  });

  const journalsInPeriod = await prisma.salesJournal.findMany({
    where: { date: { gte: fromDt, lte: toDt }, ...(userId ? { userId } : {}) },
    select: { userId: true, customerId: true },
  });
  const journaledPairs = new Set(journalsInPeriod.map((j) => `${j.userId}|${j.customerId}`));

  const unjournByAgent: Record<string, { name: string; customerIds: Set<string>; leads: { id: string; name: string; lastActiveAt: string }[] }> = {};
  for (const c of assignedConvs) {
    const agId = c.assignedToId!;
    if (journaledPairs.has(`${agId}|${c.customerId}`)) continue;
    if (!unjournByAgent[agId]) unjournByAgent[agId] = { name: c.assignedTo!.name, customerIds: new Set(), leads: [] };
    if (unjournByAgent[agId].customerIds.has(c.customerId)) continue;
    unjournByAgent[agId].customerIds.add(c.customerId);
    unjournByAgent[agId].leads.push({
      id: c.customerId,
      name: c.customer?.name || c.customer?.phone || "Lead",
      lastActiveAt: (c.lastMessageAt ?? fromDt).toISOString(),
    });
  }
  const unjournaled = Object.entries(unjournByAgent).map(([uid, d]) => ({
    userId: uid, name: d.name, count: d.customerIds.size,
    leads: d.leads.sort((a, b) => new Date(a.lastActiveAt).getTime() - new Date(b.lastActiveAt).getTime()),
  })).sort((a, b) => b.count - a.count);

  // 11. Tanda Minat (dalam periode)
  const minatItems = await prisma.leadTagItem.findMany({
    where: { createdAt: { gte: fromDt, lte: toDt } },
    select: { tagId: true, tag: { select: { name: true, color: true } } },
  });
  const minatMap: Record<string, { tagId: string; name: string; color: string; count: number }> = {};
  for (const i of minatItems) {
    if (!minatMap[i.tagId]) minatMap[i.tagId] = { tagId: i.tagId, name: i.tag.name, color: i.tag.color, count: 0 };
    minatMap[i.tagId].count++;
  }
  const minat = Object.values(minatMap).sort((a, b) => b.count - a.count);

  // 12. Lead belum ditandai tanda minat — semua lead aktif, tanpa filter periode
  const [taggedIds, allActiveCustomers] = await Promise.all([
    prisma.leadTagItem.findMany({ select: { customerId: true }, distinct: ["customerId"] })
      .then((rows) => new Set(rows.map((r) => r.customerId))),
    prisma.customer.findMany({
      where: { closedAt: null, assignedToId: { not: null }, ...(userId ? { assignedToId: userId } : {}) },
      select: { id: true, name: true, phone: true, assignedToId: true, assignedTo: { select: { id: true, name: true } }, createdAt: true },
    }),
  ]);

  const untaggedByAgent: Record<string, { name: string; leads: { id: string; name: string; createdAt: string }[] }> = {};
  for (const c of allActiveCustomers) {
    if (taggedIds.has(c.id)) continue;
    const agId = c.assignedToId!;
    if (!untaggedByAgent[agId]) untaggedByAgent[agId] = { name: c.assignedTo!.name, leads: [] };
    untaggedByAgent[agId].leads.push({ id: c.id, name: c.name || c.phone || "Lead", createdAt: c.createdAt.toISOString() });
  }
  const untaggedLeads = Object.entries(untaggedByAgent)
    .map(([uid, d]) => ({ userId: uid, name: d.name, count: d.leads.length, leads: d.leads }))
    .sort((a, b) => b.count - a.count);

  // 13. Lead tanpa rencana tindak lanjut — semua lead aktif, kecuali label closing/fail
  const excludeLabels = new Set([...closingLabels, ...failLabels]);
  const activeCustomerIds = allActiveCustomers.map((c) => c.id);

  // Ambil semua jurnal dari lead aktif (untuk cek nextAction/scheduledAt)
  const journalsForFU = await prisma.salesJournal.findMany({
    where: { customerId: { in: activeCustomerIds } },
    orderBy: { date: "desc" },
    select: { customerId: true, nextAction: true, scheduledAt: true, isClosingFail: true, label: true },
  });

  // Map: customerId → jurnal terbaru
  const latestJournalMap: Record<string, typeof journalsForFU[0]> = {};
  for (const j of journalsForFU) {
    if (!latestJournalMap[j.customerId]) latestJournalMap[j.customerId] = j;
  }

  // Set: customerId yang punya SETIDAKNYA SATU jurnal dengan nextAction/scheduledAt
  const customerIdsWithAnyPlan = new Set(
    journalsForFU.filter((j) => j.nextAction?.trim() || j.scheduledAt).map((j) => j.customerId)
  );

  const noAnyPlanByAgent: Record<string, { name: string; leads: { id: string; name: string }[] }> = {};
  const noLatestPlanByAgent: Record<string, { name: string; leads: { id: string; name: string }[] }> = {};

  for (const c of allActiveCustomers) {
    const latestJ = latestJournalMap[c.id];
    // Skip jika jurnal terakhir menandakan terminal (closing/gagal/drop)
    if (latestJ?.isClosingFail) continue;
    if (latestJ?.label && excludeLabels.has(latestJ.label)) continue;

    const agId = c.assignedToId!;
    const leadInfo = { id: c.id, name: c.name || c.phone || "Lead" };

    // Sub A: belum pernah ada rencana tindak lanjut sama sekali
    if (!customerIdsWithAnyPlan.has(c.id)) {
      if (!noAnyPlanByAgent[agId]) noAnyPlanByAgent[agId] = { name: c.assignedTo!.name, leads: [] };
      noAnyPlanByAgent[agId].leads.push(leadInfo);
    }

    // Sub B: punya jurnal tapi jurnal terakhir tidak ada nextAction/scheduledAt
    if (latestJ && !latestJ.nextAction?.trim() && !latestJ.scheduledAt) {
      if (!noLatestPlanByAgent[agId]) noLatestPlanByAgent[agId] = { name: c.assignedTo!.name, leads: [] };
      noLatestPlanByAgent[agId].leads.push(leadInfo);
    }
  }

  const noAnyPlan = Object.entries(noAnyPlanByAgent)
    .map(([uid, d]) => ({ userId: uid, name: d.name, count: d.leads.length, leads: d.leads }))
    .sort((a, b) => b.count - a.count);
  const noLatestPlan = Object.entries(noLatestPlanByAgent)
    .map(([uid, d]) => ({ userId: uid, name: d.name, count: d.leads.length, leads: d.leads }))
    .sort((a, b) => b.count - a.count);

  // Hitung lead "masih berprogres" untuk chart point 3
  const inProgress = Math.max(0, totalLeads - closingCustomers - failCustomers);

  return NextResponse.json({
    period: { from, to },
    summary: { totalLeads, totalEntries: allJournals.length, closingCustomers, failCustomers, closingRate, inProgress },
    picTable,
    activityBreakdown,
    fuEffectiveness,
    failAnalysis,
    totalFail,
    timeToClose: {
      count: ttcValues.length,
      avgMinutes: ttcAvgMinutes,
      minMinutes: ttcMinMinutes,
      maxMinutes: ttcMaxMinutes,
      brackets: ttcBrackets,
      perPic: ttcPerPic,
    },
    handlerClosing: handlerClosingTable,
    responseTime: {
      frt: { count: allFrtValues.length, avgMinutes: allFrtValues.length > 0 ? Math.round(allFrtValues.reduce((a, b) => a + b, 0) / allFrtValues.length) : null, brackets: frtBrackets, perAgent: frtPerAgent },
      art: { perAgent: artPerAgent },
    },
    unjournaled,
    minat,
    untaggedLeads,
    noFollowUpPlan: { noAnyPlan, noLatestPlan },
  });
}
