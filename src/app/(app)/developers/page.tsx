import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PageHeader } from "@/components/page-header";
import { DevelopersClient } from "./developers-client";

export const dynamic = "force-dynamic";

export default async function DevelopersPage() {
  const session = await getSession();
  if (!session || !can(session.role, "manage_channels")) {
    return (
      <>
        <PageHeader title="API & Webhook" />
        <div className="p-6 text-sm text-muted-foreground">
          Kamu tidak punya akses ke menu ini.
        </div>
      </>
    );
  }
  return <DevelopersClient />;
}
