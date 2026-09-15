import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AnalyticsClient } from "./analytics-client";

export const dynamic = "force-dynamic";

export default async function JurnalAnalyticsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  return <AnalyticsClient role={session.role} />;
}
