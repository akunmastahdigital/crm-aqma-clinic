"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, ArrowRight, AlarmClock, MessageCircle, BookOpen, Search } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { formatDateTime } from "@/lib/format";

type FollowUp = {
  id: string;
  scheduledAt: string;
  note: string | null;
  conversationId: string | null;
  customer: { name: string | null; externalId: string };
  assignedTo: { name: string } | null;
};

export function FollowupClient() {
  const [items, setItems] = useState<FollowUp[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const router = useRouter();

  const load = useCallback(async () => {
    const r = await fetch("/api/crm/journal/followup-pending");
    if (r.ok) setItems((await r.json()).items);
    setLoading(false);
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  async function doFollowUp(f: FollowUp) {
    setItems((arr) => arr.filter((x) => x.id !== f.id));
    await fetch(`/api/crm/journal/${f.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "DONE" }),
    });
    if (f.conversationId) router.push(`/inbox?c=${f.conversationId}`);
    else router.push("/inbox");
  }

  const now = new Date();
  const nowMs = now.getTime();
  const endOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    23,
    59,
    59,
    999,
  ).getTime();
  const at = (f: FollowUp) => new Date(f.scheduledAt!).getTime();
  const q = search.toLowerCase().replace(/\D/g, "").length >= 4
    ? search.replace(/\D/g, "")
    : search.toLowerCase();
  const filtered = search
    ? items.filter((f) => {
        const name = (f.customer.name ?? "").toLowerCase();
        const ext = f.customer.externalId;
        if (search.replace(/\D/g, "").length >= 4) {
          return name.includes(search.toLowerCase()) || ext.includes(q);
        }
        return name.includes(q) || ext.includes(q);
      })
    : items;
  const terlambat = filtered.filter((f) => f.scheduledAt && at(f) < nowMs);
  const hariIni = filtered.filter((f) => f.scheduledAt && at(f) >= nowMs && at(f) <= endOfToday);
  const akanDatang = filtered.filter((f) => f.scheduledAt && at(f) > endOfToday);

  return (
    <>
      <PageHeader
        title="Follow Up"
        description="Jadwal FU dari Jurnal Sales — status Pending dengan tanggal terjadwal"
      />
      <div className="p-6">
        <div className="mb-4 flex items-center gap-2 rounded-[var(--radius-lg)] border border-border bg-white p-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            type="text"
            placeholder="Cari nama atau nomor telepon..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {search && (
            <button onClick={() => setSearch("")} className="text-xs text-muted-foreground hover:text-foreground">
              Hapus
            </button>
          )}
        </div>
        {loading ? (
          <div className="text-sm text-muted-foreground">Memuat...</div>
        ) : filtered.length === 0 ? (
          <div className="rounded-[var(--radius-lg)] border border-dashed border-border bg-white p-10 text-center">
            <CalendarClock className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            {search ? (
              <p className="text-sm text-muted-foreground">
                Tidak ada hasil untuk &quot;{search}&quot;.
              </p>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Belum ada jadwal follow up pending.
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Jadwalkan lewat menu{" "}
                  <Link href="/jurnal" className="text-primary hover:underline">Jurnal Sales</Link>{" "}
                  saat catat aktivitas.
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="max-w-2xl space-y-5">
            {terlambat.length > 0 && (
              <Section
                title="Terlambat"
                items={terlambat}
                onDo={doFollowUp}
                onChat={(f) => f.conversationId && router.push(`/inbox?c=${f.conversationId}`)}
                variant="overdue"
              />
            )}
            {hariIni.length > 0 && (
              <Section
                title="Hari ini"
                items={hariIni}
                onDo={doFollowUp}
                onChat={(f) => f.conversationId && router.push(`/inbox?c=${f.conversationId}`)}
                variant="today"
              />
            )}
            {akanDatang.length > 0 && (
              <Section
                title="Akan datang"
                items={akanDatang}
                onDo={doFollowUp}
                onChat={(f) => f.conversationId && router.push(`/inbox?c=${f.conversationId}`)}
                variant="upcoming"
              />
            )}
          </div>
        )}
      </div>
    </>
  );
}

function Section({
  title,
  items,
  onDo,
  onChat,
  variant,
}: {
  title: string;
  items: FollowUp[];
  onDo: (f: FollowUp) => void;
  onChat: (f: FollowUp) => void;
  variant: "overdue" | "today" | "upcoming";
}) {
  const timeClass =
    variant === "overdue"
      ? "font-medium text-danger"
      : variant === "today"
        ? "font-medium text-primary-dark"
        : "text-muted-foreground";
  const headClass =
    variant === "overdue"
      ? "text-danger"
      : variant === "today"
        ? "text-primary-dark"
        : "text-muted-foreground";
  return (
    <div>
      <div className={"mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide " + headClass}>
        {variant === "overdue" && <AlarmClock className="h-3.5 w-3.5" />}
        {title} ({items.length})
      </div>
      <div className="space-y-2">
        {items.map((f) => (
          <div
            key={f.id}
            className="flex items-center gap-3 rounded-[var(--radius-md)] border border-border bg-white p-3"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary-dark">
              {(f.customer.name ?? f.customer.externalId).charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-medium">
                {f.customer.name ?? f.customer.externalId}
              </div>
              {f.note && (
                <div className="truncate text-sm text-muted-foreground">{f.note}</div>
              )}
              <div className={"mt-0.5 text-xs " + timeClass}>
                {formatDateTime(f.scheduledAt!)}
                {f.assignedTo ? ` · ${f.assignedTo.name}` : ""}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Link
                href={`/jurnal`}
                title="Lihat jurnal"
                className="inline-flex items-center rounded-[var(--radius-md)] border border-border bg-white p-2 text-muted-foreground hover:border-primary hover:text-primary"
              >
                <BookOpen className="h-4 w-4" />
              </Link>
              {f.conversationId && (
                <button
                  onClick={() => onChat(f)}
                  title="Buka chat"
                  className="inline-flex items-center rounded-[var(--radius-md)] border border-border bg-white p-2 text-muted-foreground hover:border-primary hover:text-primary"
                >
                  <MessageCircle className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={() => onDo(f)}
                title="Tandai FU selesai dan buka chat"
                className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-dark"
              >
                Selesai <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
