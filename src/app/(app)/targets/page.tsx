import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { TargetsClient } from "./targets-client";

export const dynamic = "force-dynamic";

export default async function TargetsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  return <TargetsClient role={session.role} />;
}
