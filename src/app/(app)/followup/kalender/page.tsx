import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { KalenderClient } from "./kalender-client";

export const dynamic = "force-dynamic";

export default async function KalenderPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  return <KalenderClient role={session.role} />;
}
