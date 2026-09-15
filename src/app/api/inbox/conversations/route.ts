import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { listConversations, type InboxFilter } from "@/lib/inbox";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sp = new URL(req.url).searchParams;
  const tags = sp.getAll("tags").filter(Boolean);
  const minatTagIds = sp.getAll("minatTagIds").filter(Boolean);
  const accounts = sp.getAll("accounts").filter(Boolean);
  const filter: InboxFilter = {
    read: (sp.get("read") as InboxFilter["read"]) || "all",
    assign: (sp.get("assign") as InboxFilter["assign"]) || "all",
    account: sp.get("account") || undefined,
    accounts: accounts.length > 0 ? accounts : undefined,
    q: sp.get("q") || undefined,
    take: sp.get("take") ? parseInt(sp.get("take")!, 10) : undefined,
    dateFrom: sp.get("dateFrom") || undefined,
    dateTo: sp.get("dateTo") || undefined,
    tags: tags.length > 0 ? tags : undefined,
    pipelineId: sp.get("pipelineId") || undefined,
    stageId: sp.get("stageId") || undefined,
    hasFuPending: sp.get("hasFuPending") === "1",
    needsFollowUp: sp.get("needsFollowUp") === "1",
    minatTagIds: minatTagIds.length > 0 ? minatTagIds : undefined,
  };
  const conversations = await listConversations(session, filter);
  return NextResponse.json({ conversations });
}
