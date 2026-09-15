import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PageHeader } from "@/components/page-header";
import { ChannelsClient } from "./channels-client";

export const dynamic = "force-dynamic";

export default async function ChannelsPage() {
  const session = await getSession();
  if (!session || !can(session.role, "manage_channels")) {
    return (
      <>
        <PageHeader title="Channel" />
        <div className="p-6 text-sm text-muted-foreground">
          Kamu tidak punya akses ke Channel.
        </div>
      </>
    );
  }
  return <ChannelsClient />;
}
