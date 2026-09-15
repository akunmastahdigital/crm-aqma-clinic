import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getConversationAgents } from "@/lib/agent-assignment";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const agents = await getConversationAgents(id);
  return NextResponse.json({ agents });
}
