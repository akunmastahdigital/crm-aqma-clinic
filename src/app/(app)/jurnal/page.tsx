import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { JurnalClient } from "./jurnal-client";

export default async function Page() {
  const session = await getSession();
  if (!session) redirect("/login");
  return <JurnalClient sessionUserId={session.uid} sessionRole={session.role} />;
}
