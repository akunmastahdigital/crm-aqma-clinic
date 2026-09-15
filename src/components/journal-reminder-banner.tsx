"use client";

import { useEffect, useState } from "react";
import { Bell, X, ChevronDown, ChevronUp } from "lucide-react";

type Lead = { id: string; name: string; lastActiveAt: string };

function getWindowKey(): string {
  const now = new Date();
  const jkt = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const date = `${jkt.getUTCFullYear()}-${jkt.getUTCMonth() + 1}-${jkt.getUTCDate()}`;
  const m = jkt.getUTCHours() * 60 + jkt.getUTCMinutes();
  let sub = "none";
  if (m >= 15 * 60 + 30 && m < 15 * 60 + 50) sub = "1530a";
  else if (m >= 15 * 60 + 50 && m < 16 * 60 + 30) sub = "1530b";
  else if (m >= 21 * 60 + 30 && m < 21 * 60 + 50) sub = "2130a";
  else if (m >= 21 * 60 + 50 && m < 22 * 60 + 30) sub = "2130b";
  return `journal-reminder-dismissed-${date}-${sub}`;
}

function dayLabel(isoStr: string): string {
  const jktOff = 7 * 60 * 60 * 1000;
  const nowJkt = new Date(Date.now() + jktOff);
  const thenJkt = new Date(new Date(isoStr).getTime() + jktOff);
  const nowDay = Date.UTC(nowJkt.getUTCFullYear(), nowJkt.getUTCMonth(), nowJkt.getUTCDate());
  const thenDay = Date.UTC(thenJkt.getUTCFullYear(), thenJkt.getUTCMonth(), thenJkt.getUTCDate());
  const diff = Math.round((nowDay - thenDay) / 86_400_000);
  if (diff === 0) return "";
  if (diff === 1) return "kemarin";
  return `${diff} hari lalu`;
}

export function JournalReminderBanner() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    async function check() {
      if (sessionStorage.getItem(getWindowKey())) return;
      try {
        const r = await fetch("/api/crm/journal/needs-reminder");
        if (!r.ok) return;
        const d = await r.json() as { needsReminder: boolean; leads: Lead[] };
        if (d.needsReminder && d.leads.length > 0) setLeads(d.leads);
      } catch { /* network error */ }
    }
    void check();
    const t = setInterval(check, 15 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  function dismiss() {
    sessionStorage.setItem(getWindowKey(), "1");
    setLeads([]);
  }

  if (leads.length === 0) return null;

  // Pisah lead hari ini vs carry-over
  const today = leads.filter((l) => dayLabel(l.lastActiveAt) === "");
  const carryOver = leads.filter((l) => dayLabel(l.lastActiveAt) !== "");
  const preview = leads.slice(0, 4);
  const rest = leads.length - 4;

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
      <div className="flex items-center gap-3">
        <Bell className="h-4 w-4 shrink-0 text-amber-600" />
        <span className="flex-1 font-medium">
          Reminder:{" "}
          {today.length > 0 && <span>{today.length} lead hari ini</span>}
          {today.length > 0 && carryOver.length > 0 && <span className="text-amber-600"> + </span>}
          {carryOver.length > 0 && (
            <span className="text-red-600 font-semibold">{carryOver.length} carry-over belum dicatat</span>
          )}{" "}
          belum dijurnal
        </span>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1 text-xs text-amber-700 hover:text-amber-900"
        >
          {expanded ? "Sembunyikan" : "Lihat Lead"}
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
        <button onClick={dismiss} className="shrink-0 text-amber-600 hover:text-amber-800" title="Tutup">
          <X className="h-4 w-4" />
        </button>
      </div>

      {expanded && (
        <div className="mt-2 flex flex-wrap gap-2 pl-7">
          {preview.map((lead) => {
            const label = dayLabel(lead.lastActiveAt);
            const isOld = label !== "";
            return (
              <a
                key={lead.id}
                href={`/jurnal?openFor=${lead.id}`}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 text-xs font-medium transition-colors ${
                  isOld
                    ? "bg-red-100 text-red-800 hover:bg-red-200"
                    : "bg-amber-200 text-amber-900 hover:bg-amber-300"
                }`}
              >
                {lead.name}
                {label && (
                  <span className="rounded-full bg-red-200 px-1.5 py-0 text-[10px] font-semibold text-red-700">
                    {label}
                  </span>
                )}
              </a>
            );
          })}
          {rest > 0 && (
            <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-0.5 text-xs text-amber-700">
              +{rest} lainnya
            </span>
          )}
        </div>
      )}
    </div>
  );
}
