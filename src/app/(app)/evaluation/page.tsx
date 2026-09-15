import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { EvaluationClient } from "./evaluation-client";

export default async function EvaluationPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.role, "manage_owner")) redirect("/dashboard");

  const [agents, conversations] = await Promise.all([
    prisma.user.findMany({
      where: { role: { in: ["AGENT", "SUPERADMIN"] } },
      select: { id: true, name: true, role: true },
      orderBy: { name: "asc" },
    }),
    prisma.conversation.findMany({
      orderBy: { lastMessageAt: "desc" },
      take: 100,
      select: {
        id: true,
        lastMessageAt: true,
        customer: { select: { name: true, phone: true, leadStatus: true } },
      },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Evaluasi AI"
        description="Analisis performa percakapan dan coaching agent berbasis AI — hanya Owner"
      />
      <EvaluationClient agents={agents} conversations={conversations} />
    </>
  );
}
