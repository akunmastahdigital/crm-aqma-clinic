import { getSession } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { CustomerDetailClient } from "./customer-detail-client";

export const dynamic = "force-dynamic";

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { id } = await params;

  const [customer, labelSetting, users] = await Promise.all([
    prisma.customer.findUnique({
      where: { id },
      include: {
        assignedTo: { select: { id: true, name: true } },
        deals: {
          include: {
            pipeline: { select: { name: true } },
            stage: { select: { name: true } },
          },
          orderBy: { createdAt: "desc" },
        },
        followUps: {
          orderBy: { scheduledAt: "desc" },
          take: 5,
        },
        salesJournals: {
          orderBy: { date: "desc" },
          take: 20,
          include: {
            user: { select: { name: true } },
            stage: { select: { name: true } },
          },
        },
      },
    }),
    prisma.crmSetting.findUnique({ where: { key: "journal_labels" } }),
    prisma.user.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  if (!customer) notFound();

  // AGENT can only view their own customers
  if (session.role === "AGENT" && customer.assignedToId !== session.uid) redirect("/customers");

  const journalLabels = labelSetting ? (JSON.parse(labelSetting.value) as { name: string; color: string }[]) : [];

  return (
    <CustomerDetailClient
      customer={JSON.parse(JSON.stringify(customer))}
      journalLabels={journalLabels}
      users={users}
      currentUserId={session.uid}
      currentRole={session.role}
    />
  );
}
