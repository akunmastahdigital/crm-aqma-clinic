"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { CHANNEL_META } from "@/lib/channel-meta";
import { relativeTime, windowState } from "@/lib/format";
import { ArrowLeft, Tag, Phone, MessageCircle, CalendarClock, BookOpen, CheckCircle2, Clock, RotateCcw, AlertTriangle } from "lucide-react";
import Link from "next/link";

type LabelItem = { name: string; color: string };

type Deal = {
  id: string;
  pipeline: { name: string };
  stage: { name: string };
  value: number | null;
  createdAt: string;
};

type JournalEntry = {
  id: string;
  date: string;
  activityType: string;
  followUpType: string | null;
  followUpResponse: string | null;
  label: string | null;
  isClosingFail: boolean;
  cancelReason: string | null;
  notes: string | null;
  nextAction: string | null;
  scheduledAt: string | null;
  status: "PENDING" | "DONE" | "RESCHEDULE";
  user: { name: string };
  stage: { name: string } | null;
};

type Customer = {
  id: string;
  name: string | null;
  phone: string | null;
  externalId: string;
  channel: string;
  consent: boolean;
  windowExpiresAt: string | null;
  lastContactAt: string | null;
  note: string | null;
  tags: string[];
  leadStatus: string | null;
  assignedTo: { id: string; name: string } | null;
  deals: Deal[];
  salesJournals: JournalEntry[];
};

const STATUS_META = {
  PENDING: { label: "Pending", icon: Clock, cls: "text-amber-600 bg-amber-50" },
  DONE: { label: "Selesai", icon: CheckCircle2, cls: "text-green-600 bg-green-50" },
  RESCHEDULE: { label: "Reschedule", icon: RotateCcw, cls: "text-blue-600 bg-blue-50" },
};

export function CustomerDetailClient({
  customer,
  journalLabels,
  users,
  currentUserId,
  currentRole,
}: {
  customer: Customer;
  journalLabels: LabelItem[];
  users: { id: string; name: string }[];
  currentUserId: string;
  currentRole: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"info" | "jurnal">("info");
  const [noteEdit, setNoteEdit] = useState(customer.note ?? "");

  const ch = CHANNEL_META[customer.channel as keyof typeof CHANNEL_META] ?? { label: customer.channel, color: "#6b7280" };
  const win = windowState(customer.windowExpiresAt ? new Date(customer.windowExpiresAt) : null);

  function labelBadge(tag: string) {
    const match = journalLabels.find((l) => l.name === tag);
    if (match) {
      return (
        <span
          className="rounded-full px-2 py-0.5 text-xs font-medium"
          style={{ backgroundColor: match.color + "30", color: match.color, border: `1px solid ${match.color}60` }}
        >
          {tag}
        </span>
      );
    }
    return (
      <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary-dark">{tag}</span>
    );
  }

  function journalLabelBadge(name: string | null) {
    if (!name) return null;
    const match = journalLabels.find((l) => l.name === name);
    if (!match) return <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{name}</span>;
    return (
      <span
        className="rounded-full px-2 py-0.5 text-xs font-medium"
        style={{ backgroundColor: match.color + "30", color: match.color, border: `1px solid ${match.color}60` }}
      >
        {name}
      </span>
    );
  }

  function markDone(id: string) {
    fetch(`/api/crm/journal/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "DONE" }),
    }).then(() => router.refresh());
  }

  return (
    <>
      <PageHeader
        title={customer.name ?? "Tanpa nama"}
        description={customer.phone ?? customer.externalId}
        action={
          <Link href="/customers" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
            Kembali
          </Link>
        }
      />

      <div className="p-6 space-y-5">
        {/* Summary card */}
        <Card className="p-5">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-soft text-lg font-bold text-primary-dark">
              {(customer.name ?? customer.externalId).charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-semibold">{customer.name ?? "Tanpa nama"}</h2>
              <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-muted-foreground">
                {customer.phone && (
                  <span className="flex items-center gap-1">
                    <Phone className="h-3.5 w-3.5" />
                    {customer.phone}
                  </span>
                )}
                <span
                  className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
                  style={{ backgroundColor: ch.color + "1a", color: ch.color }}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: ch.color }} />
                  {ch.label}
                </span>
                <span className={win.active ? "text-green-600" : "text-muted-foreground"}>
                  Window: {win.label}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {customer.tags.map((t) => labelBadge(t))}
            </div>
          </div>
        </Card>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border">
          {(["info", "jurnal"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "info" ? <MessageCircle className="h-4 w-4" /> : <BookOpen className="h-4 w-4" />}
              {t === "info" ? "Info" : "Jurnal Sales"}
              {t === "jurnal" && (
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium">
                  {customer.salesJournals.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* INFO TAB */}
        {tab === "info" && (
          <div className="grid gap-5 md:grid-cols-2">
            <Card className="p-5 space-y-3">
              <h3 className="text-sm font-semibold">Informasi Kontak</h3>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Ditugaskan ke</dt>
                  <dd className="font-medium">{customer.assignedTo?.name ?? "-"}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Status Lead</dt>
                  <dd className="font-medium">{customer.leadStatus ?? "-"}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Terakhir kontak</dt>
                  <dd className="font-medium">{relativeTime(customer.lastContactAt ? new Date(customer.lastContactAt) : null)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Consent</dt>
                  <dd className={customer.consent ? "text-green-600 font-medium" : "text-muted-foreground"}>
                    {customer.consent ? "Ya" : "Tidak"}
                  </dd>
                </div>
              </dl>
              <div className="mt-3">
                <p className="text-xs font-medium text-muted-foreground mb-1">Catatan</p>
                <textarea
                  value={noteEdit}
                  onChange={(e) => setNoteEdit(e.target.value)}
                  onBlur={() => {
                    if (noteEdit !== (customer.note ?? "")) {
                      fetch(`/api/customers/${customer.id}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ note: noteEdit }),
                      }).then(() => router.refresh());
                    }
                  }}
                  rows={3}
                  placeholder="Catatan internal soal pelanggan..."
                  className="w-full rounded-md border border-input px-2 py-1.5 text-sm outline-none focus:border-primary resize-none"
                />
              </div>
            </Card>

            <Card className="p-5 space-y-3">
              <h3 className="text-sm font-semibold">Pipeline & Deal</h3>
              {customer.deals.length === 0 ? (
                <p className="text-sm text-muted-foreground">Belum ada deal.</p>
              ) : (
                <div className="space-y-2">
                  {customer.deals.map((d) => (
                    <div key={d.id} className="rounded-lg border border-border p-3 text-sm">
                      <div className="font-medium">{d.pipeline.name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Stage: {d.stage.name}
                        {d.value ? ` · Rp ${d.value.toLocaleString("id-ID")}` : ""}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        )}

        {/* JURNAL TAB */}
        {tab === "jurnal" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Riwayat aktivitas sales untuk pelanggan ini
              </p>
              <Link
                href={`/jurnal?customerId=${customer.id}`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
              >
                <BookOpen className="h-3.5 w-3.5" />
                Tambah Entri
              </Link>
            </div>

            {customer.salesJournals.length === 0 ? (
              <Card className="p-8 text-center text-muted-foreground text-sm">
                Belum ada entri jurnal untuk pelanggan ini.
              </Card>
            ) : (
              <div className="relative pl-5">
                {/* timeline line */}
                <div className="absolute left-1.5 top-2 bottom-2 w-0.5 bg-border" />
                <div className="space-y-3">
                  {customer.salesJournals.map((j) => {
                    const st = STATUS_META[j.status];
                    const isOverdue = j.status === "PENDING" && j.scheduledAt && new Date(j.scheduledAt) < new Date();
                    return (
                      <div key={j.id} className="relative">
                        {/* dot */}
                        <div className={`absolute -left-5 mt-1 h-3 w-3 rounded-full border-2 border-background ${isOverdue ? "bg-red-500" : j.status === "DONE" ? "bg-green-500" : "bg-amber-400"}`} />
                        <Card className={`p-4 text-sm space-y-1.5 ${isOverdue ? "border-red-200 bg-red-50/50" : ""}`}>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{j.activityType}</span>
                              {journalLabelBadge(j.label)}
                              {isOverdue && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-600">
                                  <AlertTriangle className="h-3 w-3" />
                                  Overdue
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${st.cls}`}>
                                <st.icon className="h-3 w-3" />
                                {st.label}
                              </span>
                              {j.status !== "DONE" && (
                                <button
                                  onClick={() => markDone(j.id)}
                                  className="rounded px-2 py-0.5 text-xs font-medium text-green-600 hover:bg-green-50 border border-green-200"
                                >
                                  Tandai Selesai
                                </button>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                            <span>{new Date(j.date).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}</span>
                            <span>oleh {j.user.name}</span>
                            {j.stage && <span>Stage: {j.stage.name}</span>}
                          </div>
                          {j.followUpType && (
                            <div className="text-xs text-muted-foreground">
                              FU: {j.followUpType}
                              {j.followUpResponse ? ` · Respon: ${j.followUpResponse}` : ""}
                            </div>
                          )}
                          {j.notes && <p className="text-xs text-foreground/80 bg-muted/50 rounded p-2">{j.notes}</p>}
                          {j.nextAction && (
                            <div className="text-xs font-medium text-primary">
                              <CalendarClock className="inline h-3 w-3 mr-1" />
                              {j.nextAction}
                              {j.scheduledAt && ` · ${new Date(j.scheduledAt).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}`}
                            </div>
                          )}
                          {j.isClosingFail && (
                            <div className="text-xs text-red-600">
                              Gagal closing{j.cancelReason ? `: ${j.cancelReason}` : ""}
                            </div>
                          )}
                        </Card>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
