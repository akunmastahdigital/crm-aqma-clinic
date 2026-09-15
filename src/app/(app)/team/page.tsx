import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PageHeader } from "@/components/page-header";
import { TeamClient } from "./team-client";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const session = await getSession();
  if (!session || !can(session.role, "view_reports")) {
    return (
      <>
        <PageHeader title="Tim" />
        <div className="p-6 text-sm text-muted-foreground">
          Kamu tidak punya akses ke halaman Tim.
        </div>
      </>
    );
  }
  return <TeamClient />;
}
