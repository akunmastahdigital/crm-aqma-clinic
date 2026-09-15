import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { TrackingClient } from "./tracking-client";

export default async function TrackingPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  return (
    <>
      <PageHeader
        title="Smart Link Tracking"
        description="Kelola link tracking untuk campaign Meta Ads — capture attribution & trigger event CAPI"
      />
      <TrackingClient />
    </>
  );
}
