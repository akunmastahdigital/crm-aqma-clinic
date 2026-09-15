import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PageHeader } from "@/components/page-header";
import { CrmSettingsClient } from "./crm-settings-client";

export const dynamic = "force-dynamic";

export default async function CrmSettingsPage() {
  const session = await getSession();
  if (!session || !can(session.role, "manage_crm_settings")) {
    return (
      <>
        <PageHeader title="Pengaturan CRM" />
        <div className="p-6 text-sm text-muted-foreground">
          Kamu tidak punya akses ke pengaturan CRM.
        </div>
      </>
    );
  }
  return <CrmSettingsClient />;
}
