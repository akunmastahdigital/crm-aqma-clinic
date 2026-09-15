"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Eye, Menu, X, ChevronLeft, ChevronRight } from "lucide-react";
import { AppSidebar } from "@/components/app-sidebar";
import type { NavGroup } from "@/lib/nav";
import type { Role } from "@prisma/client";
import { JournalReminderBanner } from "@/components/journal-reminder-banner";
import { OverdueAlerts } from "@/components/overdue-alerts";
import { FuReminder } from "@/components/fu-reminder";
import { ViewerContext } from "@/lib/viewer-context";

// Shell responsif: sidebar tetap di desktop, jadi drawer (hamburger) di mobile.
export function AppShell({
  groups,
  user,
  children,
}: {
  groups: NavGroup[];
  user: { name: string; email: string; role: Role };
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [viewerToast, setViewerToast] = useState(false);
  const viewerToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pathname = usePathname();
  const isViewer = user.role === "VIEWER";

  function showViewerToast() {
    if (viewerToastTimer.current) clearTimeout(viewerToastTimer.current);
    setViewerToast(true);
    viewerToastTimer.current = setTimeout(() => setViewerToast(false), 2500);
  }

  function handleMainClickCapture(e: React.MouseEvent) {
    if (!isViewer) return;
    const el = (e.target as HTMLElement).closest(
      "button, input, select, textarea, [type='submit']"
    );
    if (el) {
      e.preventDefault();
      e.stopPropagation();
      showViewerToast();
    }
  }

  useEffect(() => {
    const saved = localStorage.getItem("sidebar-collapsed");
    if (saved === "true") setCollapsed(true);
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      localStorage.setItem("sidebar-collapsed", String(!prev));
      return !prev;
    });
  }

  // tutup drawer tiap pindah halaman
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <ViewerContext.Provider value={isViewer}>
    <div className="relative flex h-screen overflow-hidden">
      {/* Sidebar desktop */}
      <div className="hidden shrink-0 md:flex">
        <AppSidebar groups={groups} user={user} collapsed={collapsed} />
      </div>

      {/* Toggle button — sejajar area logo, desktop only */}
      <button
        onClick={toggleCollapsed}
        aria-label={collapsed ? "Buka sidebar" : "Tutup sidebar"}
        style={{ left: collapsed ? "3.25rem" : "15.25rem" }}
        className="fixed top-[18px] z-[9999] hidden h-7 w-7 items-center justify-center rounded-md bg-primary shadow-sm text-white hover:brightness-110 transition-[left] duration-200 md:flex"
      >
        {collapsed ? (
          <ChevronRight className="h-4 w-4" />
        ) : (
          <ChevronLeft className="h-4 w-4" />
        )}
      </button>

      {/* Drawer mobile + backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}
      <div
        className={
          "fixed inset-y-0 left-0 z-50 transition-transform duration-200 md:hidden " +
          (open ? "translate-x-0" : "-translate-x-full")
        }
      >
        <AppSidebar groups={groups} user={user} onNavigate={() => setOpen(false)} />
      </div>

      {/* Kolom konten */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header mobile */}
        <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-white px-4 md:hidden">
          <button
            onClick={() => setOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-md text-foreground hover:bg-muted"
            aria-label="Buka menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Aqma" className="h-7 w-7 shrink-0 rounded-md" />
            <span className="font-display text-sm font-semibold tracking-[0.16em]">AQMA</span>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {isViewer && (
            <div className="flex shrink-0 items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
              <Eye className="h-4 w-4 shrink-0" />
              <span className="font-medium">Mode Viewer</span>
              <span className="text-amber-600">— Akun ini hanya dapat melihat. Semua aksi tidak tersedia.</span>
            </div>
          )}
          <JournalReminderBanner />
          <main
            className="min-h-0 flex-1 overflow-y-auto bg-background"
            onClickCapture={handleMainClickCapture}
          >
            {children}
          </main>
        </div>
      </div>

      {/* Notif chat overdue — muncul di tengah atas untuk semua agent */}
      <OverdueAlerts />
      {/* Pengingat FU otomatis — muncul di kanan atas */}
      <FuReminder />

      {/* tombol tutup drawer (mobile) */}
      {open && (
        <button
          onClick={() => setOpen(false)}
          className="fixed left-[16.5rem] top-3 z-50 flex h-9 w-9 items-center justify-center rounded-full bg-white text-foreground shadow-md md:hidden"
          aria-label="Tutup menu"
        >
          <X className="h-5 w-5" />
        </button>
      )}

      {/* Toast Mode Viewer */}
      {viewerToast && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-[9999] -translate-x-1/2 rounded-lg bg-amber-800 px-5 py-3 text-sm font-medium text-white shadow-lg">
          Mode Viewer — aksi ini tidak tersedia
        </div>
      )}
    </div>
    </ViewerContext.Provider>
  );
}
