import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PageHeader } from "@/components/page-header";
import { AiClient } from "./ai-client";

export const dynamic = "force-dynamic";

export default async function AiPage() {
  const session = await getSession();
  if (!session || !can(session.role, "manage_ai")) {
    return (
      <>
        <PageHeader title="AI Chatbot" />
        <div className="p-6 text-sm text-muted-foreground">
          Kamu tidak punya akses ke AI Chatbot.
        </div>
      </>
    );
  }
  return <AiClient />;
}
