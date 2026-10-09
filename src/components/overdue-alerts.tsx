"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, X, MessageSquare, Clock, User } from "lucide-react";

type OverdueItem = {
  conversationId: string;
  customerId?: string;
  customerName: string;
  agentName?: string | null;
  lastMessage: string;
  unansweredSince: string;
};

const POLL_MS = 30_000;       // polling tiap 30 detik
const SNOOZE_MS = 60_000;     // "Nanti" → cooldown 1 menit

function elapsed(since: string): string {
  const secs = Math.floor((Date.now() - new Date(since).getTime()) / 1000);
  if (secs < 60) return `${secs}d`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}m ${s}d`;
}

export function OverdueAlerts() {
  const router = useRouter();
  const [items, setItems] = useState<OverdueItem[]>([]);
  // snoozed: { [convId]: expiresAt timestamp }
  const snoozed = useRef<Record<string, number>>({});
  const [, tick] = useState(0); // force re-render untuk update elapsed timer

  const fetchOverdue = useCallback(async () => {
    if (document.visibilityState === "hidden") return;
    try {
      const res = await fetch("/api/inbox/overdue");
      if (!res.ok) return;
      const data = await res.json() as { overdue: OverdueItem[] };
      setItems(data.overdue ?? []);
    } catch {
      // network error, abaikan
    }
  }, []);

  useEffect(() => {
    void fetchOverdue();
    const poll = setInterval(fetchOverdue, POLL_MS);
    const tickInterval = setInterval(() => tick((n) => n + 1), 5_000); // update elapsed tiap 5s
    return () => { clearInterval(poll); clearInterval(tickInterval); };
  }, [fetchOverdue]);

  // Filter item yang sedang di-snooze
  const visible = items.filter((it) => {
    const exp = snoozed.current[it.conversationId];
    return !exp || Date.now() > exp;
  }).slice(0, 3); // max 3 card

  if (visible.length === 0) return null;

  function snooze(convId: string) {
    snoozed.current[convId] = Date.now() + SNOOZE_MS;
    tick((n) => n + 1);
  }

  function openChat(item: OverdueItem) {
    // dismiss permanen dari list (akan hilang saat poll berikutnya karena sudah dibalas)
    snoozed.current[item.conversationId] = Date.now() + 60 * 60_000;
    tick((n) => n + 1);
    router.push(`/inbox?c=${item.conversationId}`);
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-[420px] max-w-[calc(100vw-2rem)]">
      {visible.map((item) => (
        <div
          key={item.conversationId}
          className="rounded-xl border border-red-200 bg-white shadow-lg shadow-red-100/60 overflow-hidden animate-in slide-in-from-top-2 duration-200"
        >
          {/* Header merah */}
          <div className="flex items-center gap-2 bg-red-500 px-4 py-2.5 text-white">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span className="text-sm font-semibold flex-1">Chat belum dibalas!</span>
            <div className="flex items-center gap-1 text-xs text-red-100">
              <Clock className="h-3.5 w-3.5" />
              {elapsed(item.unansweredSince)}
            </div>
          </div>

          {/* Body */}
          <div className="px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-foreground">{item.customerName}</span>
              {item.agentName && (
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                  <User className="h-3 w-3" />
                  {item.agentName}
                </span>
              )}
            </div>
            {item.lastMessage && (
              <div className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                {item.lastMessage}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 border-t border-border px-4 py-2.5">
            <button
              onClick={() => openChat(item)}
              className="flex items-center gap-1.5 rounded-lg bg-red-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-600 transition-colors"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              Buka Chat
            </button>
            <button
              onClick={() => snooze(item.conversationId)}
              className="rounded-lg border border-border px-4 py-1.5 text-sm text-muted-foreground hover:bg-muted transition-colors"
            >
              Nanti (1 mnt)
            </button>
            <button
              onClick={() => snooze(item.conversationId)}
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
