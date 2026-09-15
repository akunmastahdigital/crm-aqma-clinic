import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { InboxClient } from "./inbox-client";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  return (
    <div className="h-full">
      <InboxClient isGuest={session.role === "GUEST"} userName={session.name ?? ""} />
    </div>
  );
}
