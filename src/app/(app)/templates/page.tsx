import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PageHeader } from "@/components/page-header";
import { TemplatesClient } from "./templates-client";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const session = await getSession();
  if (!session || !can(session.role, "manage_templates")) {
    return (
      <>
        <PageHeader title="Template" />
        <div className="p-6 text-sm text-muted-foreground">
          Kamu tidak punya akses ke Template.
        </div>
      </>
    );
  }
  return <TemplatesClient />;
}
