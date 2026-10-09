"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  MessagesSquare,
  CalendarClock,
  Users,
  KanbanSquare,
  Megaphone,
  FileText,
  Images,
  Zap,
  Bot,
  UserCog,
  Plug,
  SlidersHorizontal,
  Settings,
  Code2,
  Link2,
  BrainCircuit,
  ClipboardCheck,
  LogOut,
  BookOpen,
  BarChart2,
  Sparkles,
  Target,
  Package,
  TrendingUp,
  CalendarDays,
  FileBarChart,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { NavGroup } from "@/lib/nav";
import { ROLE_LABEL } from "@/lib/rbac";
import type { Role } from "@prisma/client";
import { logoutAction } from "@/app/(app)/actions";

const ICONS: Record<string, LucideIcon> = {
  LayoutDashboard,
  MessagesSquare,
  CalendarClock,
  Users,
  KanbanSquare,
  Megaphone,
  FileText,
  Images,
  Zap,
  Bot,
  UserCog,
  Plug,
  SlidersHorizontal,
  Settings,
  Code2,
  Link2,
  BrainCircuit,
  ClipboardCheck,
  BookOpen,
  BarChart2,
  Sparkles,
  Target,
  Package,
  TrendingUp,
  CalendarDays,
  FileBarChart,
};

export function AppSidebar({
  groups,
  user,
  onNavigate,
  collapsed,
}: {
  groups: NavGroup[];
  user: { name: string; email: string; role: Role };
  onNavigate?: () => void;
  collapsed?: boolean;
}) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        "flex h-full shrink-0 flex-col bg-sidebar text-sidebar-foreground transition-[width] duration-200",
        collapsed ? "w-16" : "w-64",
      )}
    >
      {/* Logo */}
      <div className={cn("flex h-16 shrink-0 items-center gap-2", collapsed ? "justify-center px-0" : "px-5")}>
        <img src="/logo.png" alt="Aqma" className="h-8 w-8 shrink-0 rounded-lg" />
        {!collapsed && (
          <div className="leading-tight">
            <div className="font-display text-base font-semibold tracking-[0.18em] text-white">AQMA</div>
            <div className="label-caps text-accent">Aesthetic Clinic</div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className={cn("flex-1 space-y-5 py-2", collapsed ? "px-2 overflow-y-visible overflow-x-visible" : "px-3 overflow-y-auto")}>
        {groups.map((g) => (
          <div key={g.title}>
            {!collapsed && (
              <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-white/40">
                {g.title}
              </div>
            )}
            {collapsed && <div className="mb-1 h-px bg-white/10" />}
            <div className="space-y-0.5">
              {g.items.map((it) => {
                const Icon = ICONS[it.icon] ?? LayoutDashboard;
                const active = it.exact
                  ? pathname === it.href
                  : pathname === it.href || pathname.startsWith(it.href + "/");
                return (
                  <div key={it.href} className="group relative">
                    <Link
                      href={it.href}
                      onClick={onNavigate}
                      className={cn(
                        "flex items-center rounded-[var(--radius-md)] px-3 py-2 text-sm font-medium transition-colors",
                        collapsed ? "justify-center" : "gap-3",
                        active
                          ? "bg-sidebar-accent text-white"
                          : "text-white/70 hover:bg-white/5 hover:text-white",
                      )}
                    >
                      <Icon
                        className={cn(
                          "h-[18px] w-[18px] shrink-0",
                          active ? "text-accent" : "text-white/50",
                        )}
                      />
                      {!collapsed && it.label}
                    </Link>
                    {collapsed && (
                      <div className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 hidden -translate-y-1/2 rounded-md bg-gray-800 px-2 py-1 text-xs text-white shadow-md group-hover:block whitespace-nowrap">
                        {it.label}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* User */}
      <div className="border-t border-white/10 p-3">
        {collapsed ? (
          <div className="group relative flex justify-center py-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground cursor-default">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 hidden -translate-y-1/2 rounded-md bg-gray-800 px-2 py-1 text-xs text-white shadow-md group-hover:block whitespace-nowrap">
              {user.name}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-[var(--radius-md)] px-2 py-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-sm font-semibold text-white">{user.name}</div>
              <div className="truncate text-[11px] text-white/50">
                {ROLE_LABEL[user.role]}
              </div>
            </div>
            <form action={logoutAction}>
              <button
                type="submit"
                title="Keluar"
                className="flex h-8 w-8 items-center justify-center rounded-md text-white/60 hover:bg-white/10 hover:text-white"
              >
                <LogOut className="h-[18px] w-[18px]" />
              </button>
            </form>
          </div>
        )}
      </div>
    </aside>
  );
}
