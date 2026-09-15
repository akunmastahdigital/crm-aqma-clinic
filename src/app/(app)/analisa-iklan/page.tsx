import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AnalisaIklanClient } from "./analisa-iklan-client";

export const dynamic = "force-dynamic";

export default async function AnalisaIklanPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  return <AnalisaIklanClient />;
}
