"use client";

import { useCallback, useEffect, useState } from "react";
import { UserPlus, Trash2, X, Pencil } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ROLE_LABEL } from "@/lib/rbac";
import { relativeTime } from "@/lib/format";
import type { Role } from "@prisma/client";

type Member = {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  lastLoginAt: string | null;
  telegramId: string | null;
  stats: { messages: number; conversations: number; assigned: number };
};

const ROLES: Role[] = ["OWNER", "SUPERADMIN", "SUPERVISOR", "AGENT", "GUEST"];

export function TeamClient() {
  const [members, setMembers] = useState<Member[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [me, setMe] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/team");
    if (r.ok) {
      const d = await r.json();
      setMembers(d.members);
      setCanManage(d.canManage);
      setIsOwner(d.isOwner);
      setMe(d.me);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function toggleActive(m: Member) {
    await fetch(`/api/team/${m.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !m.active }) });
    load();
  }
  async function del(id: string) {
    if (!confirm("Hapus anggota ini?")) return;
    await fetch(`/api/team/${id}`, { method: "DELETE" });
    load();
  }

  const canEditRow = (m: Member) => canManage && (m.role !== "OWNER" || isOwner);

  return (
    <>
      <PageHeader
        title="Tim"
        description="Kelola agen dan pantau performa"
        action={
          canManage ? (
            <button onClick={() => setShowAdd(true)} className="inline-flex items-center gap-2 rounded-[var(--radius-md)] bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark">
              <UserPlus className="h-4 w-4" /> Tambah Agen
            </button>
          ) : undefined
        }
      />
      <div className="p-6">
        <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Agen</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Pesan</th>
                  <th className="px-4 py-3 font-medium">Percakapan</th>
                  <th className="px-4 py-3 font-medium">Ditugaskan</th>
                  <th className="px-4 py-3 font-medium">Login terakhir</th>
                  <th className="px-4 py-3 font-medium">Telegram ID</th>
                  {canManage && <th className="px-4 py-3 font-medium">Aksi</th>}
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary-dark">
                          {m.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="leading-tight">
                          <div className="font-medium">
                            {m.name}
                            {m.id === me && <span className="ml-1 text-xs text-muted-foreground">(kamu)</span>}
                            {!m.active && <span className="ml-2 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">Nonaktif</span>}
                          </div>
                          <div className="text-xs text-muted-foreground">{m.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">{ROLE_LABEL[m.role]}</span>
                    </td>
                    <td className="px-4 py-3 font-medium">{m.stats.messages}</td>
                    <td className="px-4 py-3 font-medium">{m.stats.conversations}</td>
                    <td className="px-4 py-3 font-medium">{m.stats.assigned}</td>
                    <td className="px-4 py-3 text-muted-foreground">{relativeTime(m.lastLoginAt)}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      {m.telegramId ?? <span className="italic text-muted-foreground/50">—</span>}
                    </td>
                    {canManage && (
                      <td className="px-4 py-3">
                        {canEditRow(m) && (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => setEditing(m)}
                              className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-primary/10 hover:text-primary"
                              title="Edit anggota"
                            >
                              <Pencil className="h-3.5 w-3.5" /> Edit
                            </button>
                            {m.id !== me && (
                              <>
                                <button onClick={() => toggleActive(m)} className="rounded px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted">
                                  {m.active ? "Nonaktifkan" : "Aktifkan"}
                                </button>
                                <button onClick={() => del(m.id)} className="rounded p-1 text-muted-foreground hover:bg-danger/10 hover:text-danger" title="Hapus">
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showAdd && (
        <AddMember
          isOwner={isOwner}
          onClose={() => setShowAdd(false)}
          onDone={async () => { setShowAdd(false); await load(); }}
        />
      )}

      {editing && (
        <EditMember
          member={editing}
          isOwner={isOwner}
          onClose={() => setEditing(null)}
          onDone={async () => { setEditing(null); await load(); }}
        />
      )}
    </>
  );
}

function AddMember({ isOwner, onClose, onDone }: { isOwner: boolean; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("AGENT");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit() {
    setErr("");
    setBusy(true);
    const r = await fetch("/api/team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, role, password }),
    });
    setBusy(false);
    if (r.ok) onDone();
    else setErr((await r.json()).error ?? "Gagal");
  }

  const field = "mt-1 h-10 w-full rounded-md border border-input px-3 text-sm outline-none focus:border-primary";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-[var(--radius-lg)] bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold">Tambah Agen</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium">Nama</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className={field} />
          </div>
          <div>
            <label className="text-xs font-medium">Email</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className={field} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium">Role</label>
              <select value={role} onChange={(e) => setRole(e.target.value as Role)} className={field}>
                {ROLES.filter((r) => r !== "OWNER" || isOwner).map((r) => (
                  <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium">Password</label>
              <input value={password} onChange={(e) => setPassword(e.target.value)} type="text" placeholder="min 6 karakter" className={field} />
            </div>
          </div>
          {err && <div className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{err}</div>}
          <button onClick={submit} disabled={busy || !name.trim() || !email.trim() || password.length < 6} className="h-10 w-full rounded-md bg-primary font-medium text-white hover:bg-primary-dark disabled:opacity-50">
            {busy ? "Menyimpan..." : "Buat Akun"}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditMember({ member, isOwner, onClose, onDone }: { member: Member; isOwner: boolean; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(member.name);
  const [role, setRole] = useState<Role>(member.role);
  const [password, setPassword] = useState("");
  const [telegramId, setTelegramId] = useState(member.telegramId ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [success, setSuccess] = useState("");

  async function submit() {
    setErr("");
    setSuccess("");
    if (!name.trim()) { setErr("Nama tidak boleh kosong"); return; }
    if (password && password.length < 6) { setErr("Password minimal 6 karakter"); return; }
    setBusy(true);
    const body: Record<string, unknown> = { name: name.trim(), role, telegramId: telegramId.trim() || null };
    if (password) body.password = password;
    const r = await fetch(`/api/team/${member.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (r.ok) {
      setSuccess("Tersimpan!");
      setTimeout(() => onDone(), 800);
    } else {
      setErr((await r.json()).error ?? "Gagal menyimpan");
    }
  }

  const field = "mt-1 h-10 w-full rounded-md border border-input px-3 text-sm outline-none focus:border-primary";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-[var(--radius-lg)] bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold">Edit Anggota</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>

        <div className="mb-3 rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          Email: <span className="font-mono font-medium text-foreground">{member.email}</span>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium">Nama</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className={field} />
          </div>
          <div>
            <label className="text-xs font-medium">Role</label>
            <select value={role} onChange={(e) => setRole(e.target.value as Role)} className={field}>
              {ROLES.filter((r) => r !== "OWNER" || isOwner).map((r) => (
                <option key={r} value={r}>{ROLE_LABEL[r]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium">Telegram ID</label>
            <input
              value={telegramId}
              onChange={(e) => setTelegramId(e.target.value)}
              placeholder="Chat ID (kosongkan jika tidak ada)"
              className={field + " font-mono"}
            />
          </div>
          <div>
            <label className="text-xs font-medium">Password baru <span className="font-normal text-muted-foreground">(kosongkan jika tidak ingin diganti)</span></label>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="text"
              placeholder="min 6 karakter"
              className={field}
            />
          </div>

          {err && <div className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{err}</div>}
          {success && <div className="rounded-md bg-success/10 px-3 py-2 text-sm text-success">{success}</div>}

          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="h-10 flex-1 rounded-md border border-border text-sm font-medium text-muted-foreground hover:bg-muted">
              Batal
            </button>
            <button onClick={submit} disabled={busy} className="h-10 flex-1 rounded-md bg-primary font-medium text-white hover:bg-primary-dark disabled:opacity-50">
              {busy ? "Menyimpan..." : "Simpan"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
