import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PageHeader } from "@/components/page-header";
import { BroadcastClient } from "./broadcast-client";

export const dynamic = "force-dynamic";

export default async function BroadcastPage() {
  const session = await getSession();
  if (!session || !can(session.role, "broadcast")) {
    return (
      <>
        <PageHeader title="Broadcast" />
        <div className="p-6 text-sm text-muted-foreground">
          Kamu tidak punya akses ke Broadcast.
        </div>
      </>
    );
  }
  return <BroadcastClient />;
}
