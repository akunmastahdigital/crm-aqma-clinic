import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PageHeader } from "@/components/page-header";
import { AutomationClient } from "./automation-client";

export const dynamic = "force-dynamic";

export default async function AutomationPage() {
  const session = await getSession();
  if (!session || !can(session.role, "manage_automation")) {
    return (
      <>
        <PageHeader title="Automasi" />
        <div className="p-6 text-sm text-muted-foreground">
          Kamu tidak punya akses ke Automasi.
        </div>
      </>
    );
  }
  return <AutomationClient />;
}
