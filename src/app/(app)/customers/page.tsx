import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Users, Radio, ShieldCheck, UserCheck } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { CustomersClient } from "./customers-client";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const session = await getSession();
  const isAgent = session?.role === "AGENT";

  const where: Prisma.CustomerWhereInput = isAgent ? { assignedToId: session?.uid } : {};

  const [total, windowActive, consented, assigned, labelSetting, pipelines, agents, channelRows] =
    await Promise.all([
      prisma.customer.count({ where }),
      prisma.customer.count({ where: { ...where, windowExpiresAt: { gt: new Date() } } }),
      prisma.customer.count({ where: { ...where, consent: true } }),
      prisma.customer.count({ where: { ...where, assignedToId: { not: null } } }),
      prisma.crmSetting.findUnique({ where: { key: "journal_labels" } }),
      prisma.pipeline.findMany({
        select: { id: true, name: true, stages: { select: { id: true, name: true }, orderBy: { order: "asc" } } },
        orderBy: { name: "asc" },
      }),
      prisma.user.findMany({
        where: { active: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      prisma.customer.findMany({
        distinct: ["channel"],
        select: { channel: true },
      }),
    ]);

  const labels: { name: string; color: string }[] = labelSetting
    ? (JSON.parse(labelSetting.value) as { name: string; color: string }[])
    : [];

  const channels = channelRows.map((r) => r.channel as string);

  const stats = [
    { label: "Total Pelanggan", value: total, icon: Users },
    { label: "Window Aktif", value: windowActive, icon: Radio },
    { label: "Menyetujui", value: consented, icon: ShieldCheck },
    { label: "Ditugaskan", value: assigned, icon: UserCheck },
  ];

  return (
    <>
      <PageHeader title="Pelanggan" description="Kelola kontak, consent, label, dan window 24 jam" />
      <div className="p-6">
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {stats.map((s) => (
            <Card key={s.label} className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{s.label}</span>
                <s.icon className="h-4 w-4 text-primary" />
              </div>
              <div className="mt-2 text-2xl font-bold">{s.value}</div>
            </Card>
          ))}
        </div>

        <CustomersClient options={{ labels, pipelines, agents, channels }} />
      </div>
    </>
  );
}
