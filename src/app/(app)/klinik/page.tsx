import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { KlinikClient } from "./klinik-client";

export const dynamic = "force-dynamic";

export default async function KlinikPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.role, "manage_crm_settings")) redirect("/dashboard");

  const [branches, resources, treatments, categories, staffUsers] = await Promise.all([
    prisma.branch.findMany({
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      include: { _count: { select: { resources: true } } },
    }),
    prisma.resource.findMany({
      orderBy: [{ type: "asc" }, { order: "asc" }, { createdAt: "asc" }],
      include: {
        branch: { select: { id: true, name: true } },
        user: { select: { id: true, name: true } },
      },
    }),
    prisma.treatment.findMany({
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      include: {
        category: { select: { id: true, name: true } },
        requirements: true,
      },
    }),
    prisma.packageType.findMany({ orderBy: { order: "asc" }, select: { id: true, name: true } }),
    prisma.user.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Pengaturan Klinik"
        description="Cabang, sumber daya, dan katalog treatment — dasar untuk modul jadwal"
      />
      <KlinikClient
        initialBranches={JSON.parse(JSON.stringify(branches))}
        initialResources={JSON.parse(JSON.stringify(resources))}
        initialTreatments={JSON.parse(JSON.stringify(treatments))}
        categories={categories}
        staffUsers={staffUsers}
        readOnly={session.role === "GUEST" || session.role === "VIEWER"}
      />
    </>
  );
}
