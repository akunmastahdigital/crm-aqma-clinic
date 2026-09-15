import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { ResumeClient } from "./resume-client";

export const dynamic = "force-dynamic";

export default async function ResumePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const channels = await prisma.wabaChannel.findMany({
    where: { active: true },
    select: { id: true, label: true, phoneNumberId: true, displayPhone: true },
    orderBy: { label: "asc" },
  });

  return <ResumeClient channels={channels} />;
}
