import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { navFor } from "@/lib/nav";
import { AppShell } from "@/components/app-shell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const groups = navFor(session.role);

  return (
    <AppShell
      groups={groups}
      user={{
        name: session.name,
        email: session.email,
        role: session.role,
      }}
    >
      {children}
    </AppShell>
  );
}
