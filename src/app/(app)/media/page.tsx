import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { can } from "@/lib/rbac";
import { MediaClient } from "./media-client";

export const dynamic = "force-dynamic";

export default async function MediaPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  return <MediaClient canManage={can(session.role, "manage_templates")} />;
}
