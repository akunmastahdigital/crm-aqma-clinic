"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, MessageSquare, X, Clock } from "lucide-react";
import { playInboxSound } from "@/lib/notification-sound";

type FuItem = {
  id: string;
  scheduledAt: string;
  nextAction: string | null;
  customerName: string;
  conversationId: string | null;
};

const POLL_MS = 60_000;
const REMINDED_PREFIX = "fu_reminded_";
const SNOOZE_MS = 5 * 60_000;

function timeUntil(scheduledAt: string): string {
  const diff = Math.max(0, new Date(scheduledAt).getTime() - Date.now());
  const m = Math.floor(diff / 60_000);
  const s = Math.floor((diff % 60_000) / 1000);
  if (m === 0) return `${s}d lagi`;
  return `${m}m ${s}d lagi`;
}

function markReminded(id: string) {
  try { localStorage.setItem(REMINDED_PREFIX + id, "1"); } catch {}
}

function isReminded(id: string): boolean {
  try { return !!localStorage.getItem(REMINDED_PREFIX + id); } catch { return false; }
}

function showBrowserNotif(item: FuItem) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try {
    const body = item.nextAction ? `${item.nextAction} — ${item.customerName}` : item.customerName;
    const url = item.conversationId ? `/inbox?c=${item.conversationId}` : "/inbox";
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.ready.then((reg) => {
        reg.showNotification("🔔 Pengingat Follow Up", {
          body,
          icon: "/icon-192.png",
          tag: "fu-" + item.id,
          data: { url },
        });
      }).catch(() => {});
    } else {
      new Notification("🔔 Pengingat Follow Up", { body, icon: "/icon-192.png" });
    }
  } catch {}
}

export function FuReminder() {
  const router = useRouter();
  const [visible, setVisible] = useState<FuItem[]>([]);
  const snoozed = useRef<Record<string, number>>({});
  const [, tick] = useState(0);

  const poll = useCallback(async () => {
    if (document.visibilityState === "hidden") return;
    try {
      const res = await fetch("/api/crm/journal/fu-upcoming");
      if (!res.ok) return;
      const { items } = await res.json() as { items: FuItem[] };
      const fresh: FuItem[] = [];
      for (const item of items) {
        const snoozedUntil = snoozed.current[item.id];
        if (snoozedUntil && Date.now() < snoozedUntil) continue;
        if (!isReminded(item.id)) {
          fresh.push(item);
          markReminded(item.id);
          playInboxSound();
          showBrowserNotif(item);
        } else {
          // sudah diingat tapi belum di-snooze — tampilkan saja tanpa suara
          fresh.push(item);
        }
      }
      setVisible(fresh.slice(0, 3));
    } catch {}
  }, []);

  useEffect(() => {
    void poll();
    const iv = setInterval(poll, POLL_MS);
    const tickIv = setInterval(() => tick((n) => n + 1), 5_000);
    return () => { clearInterval(iv); clearInterval(tickIv); };
  }, [poll]);

  function snooze(id: string) {
    snoozed.current[id] = Date.now() + SNOOZE_MS;
    setVisible((v) => v.filter((i) => i.id !== id));
  }

  function openChat(item: FuItem) {
    snoozed.current[item.id] = Date.now() + 2 * 60 * 60_000;
    setVisible((v) => v.filter((i) => i.id !== item.id));
    if (item.conversationId) router.push(`/inbox?c=${item.conversationId}`);
    else router.push("/inbox");
  }

  if (visible.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 w-[360px] max-w-[calc(100vw-2rem)]">
      {visible.map((item) => (
        <div
          key={item.id}
          className="rounded-xl border border-amber-200 bg-white shadow-lg shadow-amber-100/60 overflow-hidden animate-in slide-in-from-right-2 duration-200"
        >
          <div className="flex items-center gap-2 bg-amber-500 px-4 py-2.5 text-white">
            <Bell className="h-4 w-4 shrink-0" />
            <span className="text-sm font-semibold flex-1">Pengingat Follow Up</span>
            <div className="flex items-center gap-1 text-xs text-amber-100">
              <Clock className="h-3.5 w-3.5" />
              {timeUntil(item.scheduledAt!)}
            </div>
          </div>

          <div className="px-4 py-3">
            <p className="text-sm font-semibold text-foreground">{item.customerName}</p>
            {item.nextAction && (
              <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{item.nextAction}</p>
            )}
          </div>

          <div className="flex items-center gap-2 border-t border-border px-4 py-2.5">
            {item.conversationId && (
              <button
                onClick={() => openChat(item)}
                className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-600 transition-colors"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                Buka Chat
              </button>
            )}
            <button
              onClick={() => snooze(item.id)}
              className="rounded-lg border border-border px-4 py-1.5 text-sm text-muted-foreground hover:bg-muted transition-colors"
            >
              Nanti (5 mnt)
            </button>
            <button
              onClick={() => snooze(item.id)}
              className="ml-auto flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
