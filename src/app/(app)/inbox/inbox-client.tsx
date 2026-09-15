"use client";

import { useCallback, useEffect, useRef, useState, Fragment } from "react";
import { Send, Plus, X, MessageSquareDashed, CalendarClock, Mail, Paperclip, FileText, Bot, Hand, Search, Info, Reply, Image as ImageIcon, ArrowLeft, Check, CheckCheck, AlertCircle, SlidersHorizontal, Smile, Link2, UserCheck, ExternalLink, LayoutGrid, Bell, BellOff, ChevronDown } from "lucide-react";
import { playInboxSound } from "@/lib/notification-sound";
import { CustomerPanel } from "./customer-panel";
import { CHANNEL_META } from "@/lib/channel-meta";
import { relativeTime, windowState, clockTime, dateLabel, cardDate, isSameDay } from "@/lib/format";
import { cn } from "@/lib/utils";

function nameColor(name: string): string {
  const palette = ["#ef4444","#f97316","#eab308","#22c55e","#06b6d4","#6366f1","#a855f7","#ec4899"];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return palette[Math.abs(h) % palette.length];
}

type Conv = {
  id: string;
  customerId: string;
  unread: number;
  channelAccountId: string | null;
  lastMessageText: string | null;
  lastMessageAt: string | null;
  aiPaused: boolean;
  metaSubType: string | null;
  customer: { name: string | null; externalId: string; channel: keyof typeof CHANNEL_META; windowExpiresAt: string | null };
  assignedTo: { name: string } | null;
  messages: { direction: "IN" | "OUT"; status: MsgStatus; text: string | null }[];
};

type ReplyStatus = "unread" | "unreplied" | "replied";
function replyStatus(c: Conv): ReplyStatus {
  if (c.unread > 0) return "unread";
  if (c.messages[0]?.direction === "IN") return "unreplied";
  return "replied";
}
type Account = { id: string; label: string; sub: string | null; type: "WA_CLOUD" | "WA_QR" | "INSTAGRAM" | "MESSENGER" };
type FilterOptions = {
  tags: string[];
  pipelines: { id: string; name: string; stages: { id: string; name: string }[] }[];
  minatTags: { id: string; name: string; color: string }[];
};

type Media = { url: string; type: string; name?: string };
type QR = { id: string; shortcut: string; text: string | null; attachments: Media[] | null };
type ReplyRef = { id: string; text: string | null; mediaType: string | null; direction: "IN" | "OUT" };
type MsgStatus = "SENT" | "DELIVERED" | "READ" | "FAILED";
type Msg = {
  id: string;
  direction: "IN" | "OUT";
  text: string | null;
  mediaUrl: string | null;
  mediaType: string | null;
  status?: MsgStatus;
  createdAt: string;
  replyTo?: ReplyRef | null;
};

// Ceklis status kirim ala WhatsApp untuk pesan keluar.
function StatusTick({ status }: { status?: MsgStatus }) {
  if (status === "FAILED")
    return <AlertCircle className="ml-0.5 inline h-3.5 w-3.5 text-red-200" />;
  if (status === "READ")
    return <CheckCheck className="ml-0.5 inline h-3.5 w-3.5 text-[#5ec3ff]" />;
  if (status === "DELIVERED")
    return <CheckCheck className="ml-0.5 inline h-3.5 w-3.5 text-white/80" />;
  // SENT / default -> satu ceklis (belum sampai ke lead)
  return <Check className="ml-0.5 inline h-3.5 w-3.5 text-white/80" />;
}

// ringkasan singkat sebuah bubble (buat kutipan)
function msgSummary(m: { text: string | null; mediaType: string | null }): string {
  if (m.text && m.text.trim()) return m.text;
  const label: Record<string, string> = { image: "📷 Gambar", video: "🎥 Video", audio: "🎙️ Voice note", document: "📎 File" };
  return m.mediaType ? label[m.mediaType] ?? "Media" : "Pesan";
}

// Konversi VAPID public key dari base64url ke Uint8Array (dibutuhkan Web Push API)
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

async function requestPushPermission() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return false;
  try {
    const reg = await navigator.serviceWorker.register("/sw.js");
    const keyRes = await fetch("/api/push/vapid-key");
    if (!keyRes.ok) return false;
    const { publicKey } = await keyRes.json() as { publicKey: string };
    const existing = await reg.pushManager.getSubscription();
    if (existing) await existing.unsubscribe();
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
    await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sub.toJSON()),
    });
    return true;
  } catch { return false; }
}

// render teks dengan URL jadi link klikabel (hanya http/https — cegah XSS)
const URL_RE = /https?:\/\/[^\s<>"{}|\\^`[\]]+/g;
function renderTextWithLinks(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  URL_RE.lastIndex = 0;
  while ((m = URL_RE.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(
      <a key={m.index} href={m[0]} target="_blank" rel="noopener noreferrer"
        className="underline underline-offset-2 opacity-90 hover:opacity-100 break-all">
        {m[0]}
      </a>
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length ? parts : text;
}
type Active = {
  id: string;
  channelAccountId: string | null;
  aiPaused: boolean;
  aiTyping: boolean;
  aiTypingAt: string | null;
  assignedToId: string | null;
  assignedTo: { id: string; name: string } | null;
  customer: { id: string; name: string | null; externalId: string; channel: keyof typeof CHANNEL_META; windowExpiresAt: string | null; tags: string[] };
  messages: Msg[];
};

export function InboxClient({ isGuest = false, userName = "" }: { isGuest?: boolean; userName?: string }) {
  const [convs, setConvs] = useState<Conv[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [readFilter, setReadFilter] = useState<"all" | "unread" | "read">("all");
  const [assignFilter, setAssignFilter] = useState<"all" | "mine" | "unassigned">("all");
  const [accountFilters, setAccountFilters] = useState<string[]>([]);
  const [showAccountDropdown, setShowAccountDropdown] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(50);
  const [showAdvFilter, setShowAdvFilter] = useState(false);
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterTags, setFilterTags] = useState<string[]>([]);
  const [filterPipelineId, setFilterPipelineId] = useState("");
  const [filterStageId, setFilterStageId] = useState("");
  const [filterHasFuPending, setFilterHasFuPending] = useState(false);
  const [filterNeedsFollowUp, setFilterNeedsFollowUp] = useState(false);
  const [filterMinatTagIds, setFilterMinatTagIds] = useState<string[]>([]);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({ tags: [], pipelines: [], minatTags: [] });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [active, setActive] = useState<Active | null>(null);
  const [text, setText] = useState("");
  const [replyingTo, setReplyingTo] = useState<Msg | null>(null);
  const [pending, setPending] = useState<Media[]>([]);
  const [qrList, setQrList] = useState<QR[]>([]);
  const [showQR, setShowQR] = useState(false);
  const [nextFuDate, setNextFuDate] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [meRole, setMeRole] = useState<"AGENT"|"SUPERVISOR"|"SUPERADMIN"|"OWNER">("AGENT");
  const [agentsList, setAgentsList] = useState<{id:string;name:string}[]>([]);
  const [showReassign, setShowReassign] = useState(false);
  const [reassigning, setReassigning] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const [sendErr, setSendErr] = useState<string | null>(null);
  const [showSim, setShowSim] = useState(false);
  const [showPanel, setShowPanel] = useState(true);
  const [mobileDetail, setMobileDetail] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    try { return localStorage.getItem("inbox_sound") !== "false"; } catch { return true; }
  });
  const soundEnabledRef = useRef(soundEnabled);

  const threadRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null); // foto & video
  const docRef = useRef<HTMLInputElement>(null); // file/dokumen
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const activeIdRef = useRef<string | null>(null);
  const [attachMenu, setAttachMenu] = useState(false);
  const [showLibraryPicker, setShowLibraryPicker] = useState(false);
  const [libraryItems, setLibraryItems] = useState<{ id: string; url: string; name: string; type: string; size: number; folderId?: string | null }[]>([]);
  const [libraryFolders, setLibraryFolders] = useState<{ id: string; name: string }[]>([]);
  const [libraryFolder, setLibraryFolder] = useState<string | null>(null); // null = semua
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [emojiTab, setEmojiTab] = useState(0);
  const [jurnalToast, setJurnalToast] = useState<{ customerId: string; name: string } | null>(null);
  const [templates, setTemplates] = useState<{ id: string; name: string; language: string; status: string | null; bodyText: string | null }[]>([]);
  const [tplOpen, setTplOpen] = useState(false);
  const [tplSending, setTplSending] = useState(false);
  const [tplErr, setTplErr] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [guestToast, setGuestToast] = useState(false);

  function guestBlock() {
    if (!isGuest) return false;
    setGuestToast(true);
    setTimeout(() => setGuestToast(false), 2500);
    return true;
  }

  // AI typing: true jika server set aiTyping + belum timeout 30 detik
  const effectiveAiTyping = !!(
    active?.aiTyping &&
    !active.aiPaused &&
    (!active.aiTypingAt || Date.now() - new Date(active.aiTypingAt).getTime() < 30000)
  );

  // Sync activeId & soundEnabled ke ref agar SSE callback baca nilai terkini
  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);
  useEffect(() => { soundEnabledRef.current = soundEnabled; }, [soundEnabled]);

  // Daftarkan browser push notification setelah user berinteraksi
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    if (Notification.permission === "denied") return;

    async function setupPush() {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        if (Notification.permission !== "granted") return; // minta izin via tombol saja
        const existing = await reg.pushManager.getSubscription();
        if (existing) return; // sudah subscribed

        const keyRes = await fetch("/api/push/vapid-key");
        if (!keyRes.ok) return;
        const { publicKey } = await keyRes.json() as { publicKey: string };

        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
        await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(sub.toJSON()),
        });
      } catch { /* browser tidak support atau user tolak */ }
    }
    void setupPush();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // auto-tinggi komposer sesuai isi (maks lewat CSS max-h-40)
  function autoGrow() {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 260) + "px";
  }

  useEffect(() => {
    fetch("/api/quick-replies")
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => setQrList(d.items || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/templates")
      .then((r) => (r.ok ? r.json() : { templates: [] }))
      .then((d) => setTemplates((d.templates ?? []).filter((t: { status: string | null }) => t.status === "APPROVED")))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/inbox/filter-options")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setFilterOptions(d))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.role) setMeRole(d.role as typeof meRole); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (meRole === "AGENT") return;
    fetch("/api/team")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (d?.members) setAgentsList(d.members.filter((m: {active:boolean}) => m.active).map((m: {id:string;name:string}) => ({id: m.id, name: m.name})));
      })
      .catch(() => {});
  }, [meRole]);

  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    if (guestBlock()) return;
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const fd = new FormData();
    Array.from(files).forEach((f) => fd.append("files", f));
    setUploading(true);
    setUploadErr(null);
    try {
      const r = await fetch("/api/media?noLibrary=true", { method: "POST", body: fd });
      if (r.ok) {
        const d = await r.json();
        setPending((p) => [...p, ...d.media]);
      } else {
        const d = await r.json().catch(() => ({}));
        setUploadErr((d as { error?: string }).error || `Gagal upload (${r.status})`);
      }
    } catch {
      setUploadErr("Gagal upload, cek koneksi internet");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function openLibraryPicker() {
    setAttachMenu(false);
    setShowLibraryPicker(true);
    setLibraryLoading(true);
    const r = await fetch("/api/media").catch(() => null);
    if (r?.ok) {
      const d = await r.json();
      setLibraryItems(d.items ?? []);
      setLibraryFolders(d.folders ?? []);
    }
    setLibraryLoading(false);
  }

  async function loadLibraryFolder(folderId: string | null) {
    setLibraryFolder(folderId);
    setLibraryLoading(true);
    const qs = folderId ? `?folderId=${folderId}` : "";
    const r = await fetch(`/api/media${qs}`).catch(() => null);
    if (r?.ok) {
      const d = await r.json();
      setLibraryItems(d.items ?? []);
    }
    setLibraryLoading(false);
  }

  function pickFromLibrary(item: { url: string; name: string; type: string }) {
    const mediaType = item.type.startsWith("image/") ? "image"
      : item.type.startsWith("video/") ? "video"
      : item.type.startsWith("audio/") ? "audio"
      : "document";
    setPending((p) => [...p, { url: item.url, type: mediaType, name: item.name }]);
    setShowLibraryPicker(false);
  }

  function onText(v: string) {
    setText(v);
    setShowQR(v.startsWith("/"));
    requestAnimationFrame(autoGrow);
  }

  function resolveVars(tpl: string): string {
    const customerName = active?.customer?.name ?? active?.customer?.externalId ?? "";
    const today = new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
    const fuFormatted = nextFuDate
      ? new Date(nextFuDate).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })
      : "";
    return tpl
      .replace(/\{\{nama\}\}/gi, customerName)
      .replace(/\{\{nama_agent\}\}/gi, userName)
      .replace(/\{\{hari_ini\}\}/gi, today)
      .replace(/\{\{tanggal_fu\}\}/gi, fuFormatted);
  }

  function applyQR(q: QR) {
    setText(resolveVars(q.text ?? ""));
    if (q.attachments && q.attachments.length) setPending((p) => [...p, ...q.attachments!]);
    setShowQR(false);
    requestAnimationFrame(autoGrow);
  }

  // buka percakapan otomatis — ?c=<conversationId> atau ?customer=<customerId>
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const c = sp.get("c");
    if (c) { setActiveId(c); return; }
    const custId = sp.get("customer");
    if (!custId) return;
    // fetch langsung ke API — tidak bergantung pada convs yang ter-load
    fetch(`/api/inbox/by-customer?customerId=${custId}`)
      .then((r) => r.json())
      .then((d) => { if (d.conversationId) setActiveId(d.conversationId); })
      .catch(() => {});
  }, []);

  // debounce pencarian
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setLimit(50);
    }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const activeFilterCount = [
    filterDateFrom,
    filterDateTo,
    filterTags.length > 0,
    filterPipelineId,
    filterStageId,
    filterHasFuPending,
    filterMinatTagIds.length > 0,
  ].filter(Boolean).length;

  function resetFilters() {
    setFilterDateFrom("");
    setFilterDateTo("");
    setFilterTags([]);
    setFilterPipelineId("");
    setFilterStageId("");
    setFilterHasFuPending(false);
    setFilterNeedsFollowUp(false);
    setFilterMinatTagIds([]);
    setLimit(50);
  }

  function toggleMinatTag(id: string) {
    setFilterMinatTagIds((prev) => {
      if (id === "__none__") return prev.includes("__none__") ? [] : ["__none__"];
      const withoutNone = prev.filter((x) => x !== "__none__");
      return withoutNone.includes(id)
        ? withoutNone.filter((x) => x !== id)
        : [...withoutNone, id];
    });
    setLimit(50);
  }

  function toggleTag(tag: string) {
    setFilterTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
    setLimit(50);
  }

  const loadConvs = useCallback(async () => {
    const sp = new URLSearchParams();
    sp.set("read", readFilter);
    sp.set("assign", assignFilter);
    sp.set("take", String(limit));
    accountFilters.forEach((id) => sp.append("accounts", id));
    if (search.trim()) sp.set("q", search.trim());
    if (filterDateFrom) sp.set("dateFrom", filterDateFrom);
    if (filterDateTo) sp.set("dateTo", filterDateTo);
    filterTags.forEach((t) => sp.append("tags", t));
    filterMinatTagIds.forEach((id) => sp.append("minatTagIds", id));
    if (filterStageId) sp.set("stageId", filterStageId);
    else if (filterPipelineId) sp.set("pipelineId", filterPipelineId);
    if (filterHasFuPending) sp.set("hasFuPending", "1");
    if (filterNeedsFollowUp) sp.set("needsFollowUp", "1");
    const r = await fetch(`/api/inbox/conversations?${sp}`);
    if (r.ok) setConvs((await r.json()).conversations);
  }, [readFilter, assignFilter, accountFilters, search, limit, filterDateFrom, filterDateTo, filterTags, filterPipelineId, filterStageId, filterHasFuPending, filterNeedsFollowUp, filterMinatTagIds]);

  useEffect(() => {
    fetch("/api/inbox/accounts")
      .then((r) => (r.ok ? r.json() : { accounts: [] }))
      .then((d) => setAccounts(d.accounts || []))
      .catch(() => {});
  }, []);

  const accountLabel = (id: string | null) =>
    id ? accounts.find((a) => a.id === id)?.label ?? null : null;

  const CHANNEL_ICON: Record<Account["type"], string> = {
    WA_CLOUD: "WA",
    WA_QR: "WA",
    INSTAGRAM: "IG",
    MESSENGER: "MSG",
  };

  async function reassignConv(convId: string, assignedToId: string | null) {
    if (guestBlock()) return;
    setReassigning(true);
    try {
      const res = await fetch(`/api/inbox/conversations/${convId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignedToId }),
      });
      if (res.ok) {
        const agent = assignedToId ? agentsList.find((a) => a.id === assignedToId) ?? null : null;
        setConvs((prev) =>
          prev.map((c) =>
            c.id === convId ? { ...c, assignedTo: agent } : c,
          ),
        );
        if (active?.id === convId) {
          setActive((prev) => prev ? { ...prev, assignedToId, assignedTo: agent } : prev);
        }
      }
    } finally {
      setReassigning(false);
      setShowReassign(false);
    }
  }

  async function markUnread(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    await fetch(`/api/inbox/conversations/${id}/unread`, { method: "POST" });
    loadConvs();
  }

  async function toggleAi(current: Active) {
    if (guestBlock()) return;
    await fetch(`/api/inbox/conversations/${current.id}/ai`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paused: !current.aiPaused }),
    });
    loadActive(current.id);
  }

  const loadActive = useCallback(async (id: string) => {
    const r = await fetch(`/api/inbox/conversations/${id}`);
    if (r.ok) {
      const data = await r.json();
      const conv = data.conversation;
      // API mengembalikan desc (terbaru duluan) agar 200 pesan terbaru yang diambil
      if (conv?.messages) conv.messages = [...conv.messages].reverse();
      setActive(conv);
    }
  }, []);

  // SSE — terima push event dari server saat ada pesan baru/keluar
  useEffect(() => {
    loadConvs();
    const es = new EventSource("/api/inbox/stream");
    es.addEventListener("inbox", (e) => {
      const { conversationId, type } = JSON.parse((e as MessageEvent).data) as { conversationId: string; type?: string };
      loadConvs();
      const cur = activeIdRef.current;
      if (cur && cur === conversationId) loadActive(cur);
      if (type === "incoming" && soundEnabledRef.current) playInboxSound();
    });
    // Fallback poll 60 detik — safety net kalau SSE putus diam-diam
    const fallback = setInterval(loadConvs, 60_000);
    return () => { es.close(); clearInterval(fallback); };
  }, [loadConvs]);

  // Load pesan saat pindah percakapan
  useEffect(() => {
    if (!activeId) return;
    loadActive(activeId);
  }, [activeId, loadActive]);

  // Poll cepat hanya saat AI sedang typing (interval 1 detik)
  useEffect(() => {
    if (!activeId || !active?.aiTyping) return;
    const t = setInterval(() => loadActive(activeId), 1_000);
    return () => clearInterval(t);
  }, [activeId, loadActive, active?.aiTyping]);

  // Ambil tanggal FU berikutnya untuk customer aktif (untuk variabel {{tanggal_fu}})
  useEffect(() => {
    setNextFuDate(null);
    const customerId = active?.customer?.id;
    if (!customerId) return;
    fetch(`/api/crm/journal?customerId=${customerId}&status=PENDING&take=5`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!data?.items) return;
        const now = Date.now();
        const next = (data.items as { scheduledAt: string | null }[])
          .filter((j) => j.scheduledAt && new Date(j.scheduledAt).getTime() > now)
          .sort((a, b) => new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime())[0];
        setNextFuDate(next?.scheduledAt ?? null);
      })
      .catch(() => {});
  }, [active?.customer?.id]);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ block: "end" });
    });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [activeId, scrollToBottom]);

  useEffect(() => {
    scrollToBottom();
  }, [active?.messages.length, scrollToBottom]);

  async function send() {
    if (guestBlock()) return;
    if ((!text.trim() && pending.length === 0) || !activeId) return;
    setSending(true);
    setSendErr(null);
    const savedPending = [...pending];
    const body = { text, attachments: pending, replyToId: replyingTo?.id ?? null };
    setText("");
    setPending([]);
    setReplyingTo(null);
    setShowQR(false);
    if (composerRef.current) composerRef.current.style.height = "auto";
    try {
      const r = await fetch(`/api/inbox/conversations/${activeId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setSendErr((d as { error?: string }).error || `Gagal kirim (${r.status})`);
        setPending(savedPending);
      }
    } catch {
      setSendErr("Gagal kirim, cek koneksi internet");
      setPending(savedPending);
    }
    await Promise.all([loadActive(activeId), loadConvs()]);
    setSending(false);
    // Cek jurnal hari ini setelah reply pertama
    const cid = active?.customer.id;
    const cname = active?.customer.name ?? active?.customer.externalId ?? "";
    if (cid) {
      const alerted = sessionStorage.getItem(`j-alerted-${cid}`);
      if (!alerted) {
        try {
          const chk = await fetch(`/api/crm/journal/check-today?customerId=${cid}`);
          if (chk.ok) {
            const { hasEntry } = await chk.json();
            if (!hasEntry) setJurnalToast({ customerId: cid, name: cname });
          }
        } catch {}
      }
    }
  }

  async function sendTemplate(templateName: string, language: string) {
    if (guestBlock()) return;
    if (!activeId) return;
    setTplSending(true);
    setTplErr(null);
    try {
      const r = await fetch(`/api/inbox/conversations/${activeId}/send-template`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateName, language }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setTplErr((d as { error?: string }).error || `Gagal kirim template (${r.status})`);
      } else {
        setTplOpen(false);
      }
    } catch {
      setTplErr("Gagal kirim, cek koneksi internet");
    }
    await Promise.all([loadActive(activeId), loadConvs()]);
    setTplSending(false);
  }

  async function resendMessage(messageId: string) {
    if (guestBlock()) return;
    if (!activeId || resendingId) return;
    setResendingId(messageId);
    try {
      await fetch(`/api/inbox/conversations/${activeId}/resend-message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId }),
      });
      await loadActive(activeId);
    } catch { /* noop */ }
    setResendingId(null);
  }

  const qrMatches = showQR
    ? qrList.filter((q) => q.shortcut.startsWith(text.toLowerCase()))
    : [];

  const win = active ? windowState(active.customer.windowExpiresAt) : null;

  return (
    <div className="flex h-full">
      {/* Daftar percakapan */}
      <div className={cn(
        "w-full shrink-0 flex-col border-r border-border bg-white md:flex md:w-80",
        activeId ? "hidden md:flex" : "flex",
      )}>
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="font-semibold">Kotak Masuk</h2>
          <div className="flex items-center gap-1.5">
            <button
              onClick={async () => {
                const next = !soundEnabled;
                setSoundEnabled(next);
                localStorage.setItem("inbox_sound", String(next));
                // Saat aktifkan suara, sekalian minta izin push notification
                if (next && typeof window !== "undefined" && Notification.permission === "default") {
                  await requestPushPermission();
                }
              }}
              title={soundEnabled ? "Notifikasi suara aktif — klik untuk matikan" : "Notifikasi suara mati — klik untuk aktifkan"}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-md transition-colors",
                soundEnabled
                  ? "text-primary hover:bg-primary-soft"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              {soundEnabled ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
            </button>
            <button
              onClick={() => setShowSim(true)}
              className="flex items-center gap-1 rounded-md bg-primary-soft px-2 py-1 text-xs font-medium text-primary-dark hover:bg-primary/15"
            >
              <Plus className="h-3.5 w-3.5" /> Simulasi
            </button>
          </div>
        </div>

        {/* Filter */}
        <div className="flex flex-col gap-2 border-b border-border px-3 py-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Cari nama / nomor..."
              className="h-9 w-full rounded-md border border-input bg-white pl-8 pr-8 text-sm outline-none focus:border-primary"
            />
            {searchInput && (
              <button
                onClick={() => { setSearchInput(""); setSearch(""); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {accounts.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setShowAccountDropdown(!showAccountDropdown)}
                className="flex w-full items-center justify-between rounded-md border border-input bg-white px-2 py-1.5 text-xs font-medium outline-none hover:bg-muted/40"
              >
                <span className="truncate">
                  {accountFilters.length === 0
                    ? `Semua channel (${accounts.length})`
                    : accountFilters.length === 1
                      ? (accounts.find((a) => a.id === accountFilters[0])?.label ?? "1 channel")
                      : `${accountFilters.length} channel dipilih`}
                </span>
                <ChevronDown className="ml-1 h-3 w-3 shrink-0 text-muted-foreground" />
              </button>

              {showAccountDropdown && (
                <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-md border border-border bg-white shadow-lg">
                  <div className="max-h-56 overflow-y-auto py-1">
                    {/* Semua */}
                    <button
                      onClick={() => { setAccountFilters([]); setShowAccountDropdown(false); }}
                      className={cn(
                        "flex w-full items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/50",
                        accountFilters.length === 0 ? "font-semibold text-primary" : "",
                      )}
                    >
                      <span className={cn(
                        "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border",
                        accountFilters.length === 0 ? "border-primary bg-primary" : "border-border",
                      )}>
                        {accountFilters.length === 0 && <Check className="h-2.5 w-2.5 text-white" />}
                      </span>
                      Semua channel
                    </button>
                    <div className="my-1 border-t border-border" />
                    {accounts.map((a) => {
                      const checked = accountFilters.includes(a.id);
                      const COLOR: Record<Account["type"], string> = {
                        WA_CLOUD: "bg-green-100 text-green-700",
                        WA_QR: "bg-green-100 text-green-700",
                        INSTAGRAM: "bg-pink-100 text-pink-700",
                        MESSENGER: "bg-blue-100 text-blue-700",
                      };
                      return (
                        <button
                          key={a.id}
                          onClick={() => {
                            setAccountFilters((prev) =>
                              prev.includes(a.id) ? prev.filter((x) => x !== a.id) : [...prev, a.id],
                            );
                          }}
                          className="flex w-full items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/50"
                        >
                          <span className={cn(
                            "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border",
                            checked ? "border-primary bg-primary" : "border-border",
                          )}>
                            {checked && <Check className="h-2.5 w-2.5 text-white" />}
                          </span>
                          <span className="truncate flex-1 text-left">{a.label}</span>
                          <span className={cn("shrink-0 rounded px-1 py-0.5 text-[9px] font-bold leading-none", COLOR[a.type])}>
                            {CHANNEL_ICON[a.type]}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {accountFilters.length > 0 && (
                    <div className="border-t border-border px-3 py-1.5">
                      <button
                        onClick={() => setAccountFilters([])}
                        className="text-[11px] text-muted-foreground hover:text-foreground"
                      >
                        Reset filter
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          <div className="flex items-center gap-2">
            <div className="flex rounded-md bg-muted p-0.5 text-xs">
              {([
                ["all", "Semua"],
                ["unread", "Belum dibaca"],
                ["read", "Sudah"],
              ] as const).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setReadFilter(val)}
                  className={cn(
                    "rounded px-2 py-1 font-medium transition-colors",
                    readFilter === val
                      ? "bg-white text-primary-dark shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <select
              value={assignFilter}
              onChange={(e) => setAssignFilter(e.target.value as typeof assignFilter)}
              className="ml-auto rounded-md border border-input bg-white px-2 py-1 text-xs outline-none focus:border-primary"
            >
              <option value="all">Semua chat</option>
              <option value="mine">Chat saya</option>
              <option value="unassigned">Belum di-assign</option>
            </select>
          </div>
          {/* Filter lanjutan toggle */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => setShowAdvFilter((v) => !v)}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                showAdvFilter || activeFilterCount > 0
                  ? "bg-primary text-white"
                  : "bg-muted text-muted-foreground hover:text-foreground",
              )}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Filter
              {activeFilterCount > 0 && (
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white text-[10px] font-bold text-primary">
                  {activeFilterCount}
                </span>
              )}
            </button>
            {activeFilterCount > 0 && (
              <button
                onClick={resetFilters}
                className="text-xs text-muted-foreground underline hover:text-danger"
              >
                Reset filter
              </button>
            )}
          </div>
        </div>

        {/* Panel filter lanjutan */}
        {showAdvFilter && (
          <div className="border-b border-border bg-muted/30 px-3 py-3 space-y-3">
            {/* Tanggal */}
            <div>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Tanggal Chat</div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="mb-0.5 text-[10px] text-muted-foreground">Dari</div>
                  <input
                    type="date"
                    value={filterDateFrom}
                    onChange={(e) => { setFilterDateFrom(e.target.value); setLimit(50); }}
                    className="h-8 w-full rounded-md border border-input bg-white px-2 text-xs outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <div className="mb-0.5 text-[10px] text-muted-foreground">Sampai</div>
                  <input
                    type="date"
                    value={filterDateTo}
                    onChange={(e) => { setFilterDateTo(e.target.value); setLimit(50); }}
                    className="h-8 w-full rounded-md border border-input bg-white px-2 text-xs outline-none focus:border-primary"
                  />
                </div>
              </div>
            </div>

            {/* Label */}
            {filterOptions.tags.length > 0 && (
              <div>
                <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Label</div>
                <div className="flex flex-wrap gap-1.5">
                  {filterOptions.tags.map((tag) => (
                    <button
                      key={tag}
                      onClick={() => toggleTag(tag)}
                      className={cn(
                        "rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
                        filterTags.includes(tag)
                          ? "border-primary bg-primary text-white"
                          : "border-border bg-white text-foreground hover:border-primary/60",
                      )}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Pipeline & Stage */}
            {filterOptions.pipelines.length > 0 && (
              <div>
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Pipeline / Stage</div>
                <div className="space-y-1.5">
                  <select
                    value={filterPipelineId}
                    onChange={(e) => {
                      setFilterPipelineId(e.target.value);
                      setFilterStageId("");
                      setLimit(50);
                    }}
                    className="w-full rounded-md border border-input bg-white px-2 py-1.5 text-xs outline-none focus:border-primary"
                  >
                    <option value="">Semua pipeline</option>
                    {filterOptions.pipelines.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  {filterPipelineId && (
                    <select
                      value={filterStageId}
                      onChange={(e) => { setFilterStageId(e.target.value); setLimit(50); }}
                      className="w-full rounded-md border border-input bg-white px-2 py-1.5 text-xs outline-none focus:border-primary"
                    >
                      <option value="">Semua stage</option>
                      {filterOptions.pipelines
                        .find((p) => p.id === filterPipelineId)
                        ?.stages.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                    </select>
                  )}
                </div>
              </div>
            )}

            {/* Tanda Minat */}
            {(filterOptions.minatTags?.length ?? 0) > 0 && (
              <div>
                <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Tanda Minat</div>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => toggleMinatTag("__none__")}
                    className={cn(
                      "rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
                      filterMinatTagIds.includes("__none__")
                        ? "border-primary bg-primary text-white"
                        : "border-border bg-white text-foreground hover:border-primary/60",
                    )}
                  >
                    — Belum ditandai
                  </button>
                  {filterOptions.minatTags.map((tag) => (
                    <button
                      key={tag.id}
                      onClick={() => toggleMinatTag(tag.id)}
                      className={cn(
                        "rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
                        filterMinatTagIds.includes(tag.id)
                          ? "border-primary bg-primary text-white"
                          : "border-border bg-white text-foreground hover:border-primary/60",
                      )}
                    >
                      {tag.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Follow Up */}
            <label className="flex cursor-pointer items-center gap-2 py-0.5">
              <input
                type="checkbox"
                checked={filterHasFuPending}
                onChange={(e) => { setFilterHasFuPending(e.target.checked); setLimit(50); }}
                className="h-3.5 w-3.5 rounded border-border accent-primary"
              />
              <span className="text-xs font-medium">Ada follow up tertunda</span>
            </label>
            {/* Luar jam kerja */}
            <label className="flex cursor-pointer items-center gap-2 py-0.5">
              <input
                type="checkbox"
                checked={filterNeedsFollowUp}
                onChange={(e) => { setFilterNeedsFollowUp(e.target.checked); setLimit(50); }}
                className="h-3.5 w-3.5 rounded border-border accent-primary"
              />
              <span className="text-xs font-medium">🌙 Perlu tindak lanjut (auto-reply luar jam)</span>
            </label>
          </div>
        )}

        {/* Chips filter aktif */}
        {activeFilterCount > 0 && !showAdvFilter && (
          <div className="flex flex-wrap gap-1.5 border-b border-border px-3 py-2">
            {filterDateFrom && (
              <span className="flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-medium text-primary-dark">
                Dari: {filterDateFrom}
                <button onClick={() => { setFilterDateFrom(""); setLimit(50); }} className="hover:text-danger"><X className="h-3 w-3" /></button>
              </span>
            )}
            {filterDateTo && (
              <span className="flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-medium text-primary-dark">
                s/d: {filterDateTo}
                <button onClick={() => { setFilterDateTo(""); setLimit(50); }} className="hover:text-danger"><X className="h-3 w-3" /></button>
              </span>
            )}
            {filterTags.map((t) => (
              <span key={t} className="flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-medium text-primary-dark">
                {t}
                <button onClick={() => toggleTag(t)} className="hover:text-danger"><X className="h-3 w-3" /></button>
              </span>
            ))}
            {filterStageId && filterOptions.pipelines
              .flatMap((p) => p.stages)
              .find((s) => s.id === filterStageId) && (
              <span className="flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-medium text-primary-dark">
                Stage: {filterOptions.pipelines.flatMap((p) => p.stages).find((s) => s.id === filterStageId)?.name}
                <button onClick={() => { setFilterStageId(""); setLimit(50); }} className="hover:text-danger"><X className="h-3 w-3" /></button>
              </span>
            )}
            {!filterStageId && filterPipelineId && filterOptions.pipelines.find((p) => p.id === filterPipelineId) && (
              <span className="flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-medium text-primary-dark">
                Pipeline: {filterOptions.pipelines.find((p) => p.id === filterPipelineId)?.name}
                <button onClick={() => { setFilterPipelineId(""); setFilterStageId(""); setLimit(50); }} className="hover:text-danger"><X className="h-3 w-3" /></button>
              </span>
            )}
            {filterMinatTagIds.includes("__none__") && (
              <span className="flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-medium text-primary-dark">
                Minat: Belum ditandai
                <button onClick={() => { setFilterMinatTagIds([]); setLimit(50); }} className="hover:text-danger"><X className="h-3 w-3" /></button>
              </span>
            )}
            {filterMinatTagIds.filter((id) => id !== "__none__").map((id) => {
              const tag = filterOptions.minatTags?.find((t) => t.id === id);
              return tag ? (
                <span key={id} className="flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-medium text-primary-dark">
                  Minat: {tag.name}
                  <button onClick={() => toggleMinatTag(id)} className="hover:text-danger"><X className="h-3 w-3" /></button>
                </span>
              ) : null;
            })}
            {filterHasFuPending && (
              <span className="flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-medium text-primary-dark">
                FU pending
                <button onClick={() => { setFilterHasFuPending(false); setLimit(50); }} className="hover:text-danger"><X className="h-3 w-3" /></button>
              </span>
            )}
            {filterNeedsFollowUp && (
              <span className="flex items-center gap-1 rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
                🌙 Perlu tindak lanjut
                <button onClick={() => { setFilterNeedsFollowUp(false); setLimit(50); }} className="hover:text-danger"><X className="h-3 w-3" /></button>
              </span>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {convs.length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Belum ada percakapan.
            </div>
          )}
          {convs.map((c) => {
            const ch = CHANNEL_META[c.customer.channel];
            const activeItem = c.id === activeId;
            const status = replyStatus(c);
            const leftBorder =
              status === "unread"
                ? "border-l-[3px] border-l-primary"
                : status === "unreplied"
                  ? "border-l-[3px] border-l-amber-400"
                  : "border-l-[3px] border-l-transparent";
            const avatarRing =
              status === "unread"
                ? "ring-2 ring-primary ring-offset-1"
                : status === "unreplied"
                  ? "ring-2 ring-amber-400 ring-offset-1"
                  : "";
            return (
              <div
                key={c.id}
                role="button"
                onClick={() => setActiveId(c.id)}
                className={cn(
                  "group flex w-full cursor-pointer items-start gap-3 border-b border-border py-3 pl-3 pr-4 text-left transition-colors",
                  leftBorder,
                  activeItem ? "bg-primary-soft" : "hover:bg-muted/40",
                )}
              >
                <div className="relative shrink-0">
                  <div className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-full bg-muted text-sm font-semibold",
                    avatarRing,
                  )}>
                    {(c.customer.name ?? c.customer.externalId).charAt(0).toUpperCase()}
                  </div>
                  <span
                    className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white"
                    style={{ backgroundColor: ch.color }}
                    title={ch.label}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className={cn(
                        "truncate text-sm",
                        status === "unread" ? "font-bold" : "font-medium",
                      )}>
                        {c.customer.name ?? c.customer.externalId}
                      </span>
                      {(c.customer.channel === "INSTAGRAM" || c.customer.channel === "MESSENGER") && (
                        <span className={cn(
                          "shrink-0 rounded px-1 py-0.5 text-[10px] font-semibold leading-none",
                          c.metaSubType === "COMMENT"
                            ? "bg-orange-100 text-orange-600"
                            : "bg-pink-100 text-pink-600",
                        )}>
                          {c.customer.channel === "INSTAGRAM"
                            ? (c.metaSubType === "COMMENT" ? "Komen IG" : "DM IG")
                            : (c.metaSubType === "COMMENT" ? "Komen FB" : "DM FB")}
                        </span>
                      )}
                    </div>
                    <span className={cn(
                      "shrink-0 text-[11px]",
                      status === "unread" ? "font-semibold text-primary" : "text-muted-foreground",
                    )}>
                      {cardDate(c.lastMessageAt)}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between gap-2">
                    <span className={cn(
                      "truncate text-xs",
                      status === "unread" ? "font-medium text-foreground/80" : "text-muted-foreground",
                    )}>
                      {status === "replied" && (
                        c.messages[0]?.status === "READ"
                          ? <CheckCheck className="mr-1 inline h-3 w-3 shrink-0 text-[#5ec3ff]" />
                          : c.messages[0]?.status === "DELIVERED"
                            ? <CheckCheck className="mr-1 inline h-3 w-3 shrink-0 text-muted-foreground/50" />
                            : c.messages[0]?.status === "FAILED"
                              ? <AlertCircle className="mr-1 inline h-3 w-3 shrink-0 text-red-400" />
                              : <Check className="mr-1 inline h-3 w-3 shrink-0 text-muted-foreground/50" />
                      )}
                      {c.lastMessageText ?? "—"}
                    </span>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        onClick={(e) => markUnread(e, c.id)}
                        title="Tandai belum dibaca"
                        className="block rounded p-0.5 text-muted-foreground hover:text-primary sm:hidden sm:group-hover:block"
                      >
                        <Mail className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const url = window.location.origin + "/inbox?c=" + c.id;
                          navigator.clipboard.writeText(url);
                          setCopiedId(c.id);
                          setTimeout(() => setCopiedId((prev) => prev === c.id ? null : prev), 1500);
                        }}
                        title="Salin link chat"
                        className="block rounded p-0.5 text-muted-foreground hover:text-primary sm:hidden sm:group-hover:block"
                      >
                        {copiedId === c.id
                          ? <Check className="h-3.5 w-3.5 text-emerald-500" />
                          : <Link2 className="h-3.5 w-3.5" />}
                      </button>
                      {status === "unread" && (
                        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-white">
                          {c.unread}
                        </span>
                      )}
                      {status === "unreplied" && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                          Perlu balas
                        </span>
                      )}
                      {(c as unknown as { needsFollowUp?: boolean }).needsFollowUp && !c.aiPaused && (
                        <span className="rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700" title="Auto-reply luar jam sudah terkirim — perlu tindak lanjut">
                          🌙
                        </span>
                      )}
                    </div>
                  </div>
                  {accounts.length > 1 && accountLabel(c.channelAccountId) && (
                    <div className="mt-1">
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {accountLabel(c.channelAccountId)}
                      </span>
                    </div>
                  )}
                  {search && c.messages[0]?.text &&
                    c.messages[0].text.toLowerCase().includes(search.toLowerCase()) &&
                    !(c.customer.name ?? "").toLowerCase().includes(search.toLowerCase()) &&
                    !c.customer.externalId.includes(search.replace(/\D/g, "") || search) && (
                    <div className="mt-1 truncate rounded bg-amber-50 px-2 py-0.5 text-[10px] text-amber-700">
                      ...{c.messages[0].text}
                    </div>
                  )}
                  {(c.assignedTo || !c.aiPaused) && (
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      {!c.aiPaused && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700" title="AI sedang aktif di chat ini">
                          <Bot className="h-2.5 w-2.5" /> AI
                        </span>
                      )}
                      {c.assignedTo && (
                        <span
                          className="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
                          style={{ backgroundColor: nameColor(c.assignedTo.name) }}
                          title={"Dihandle: " + c.assignedTo.name}
                        >
                          {c.assignedTo.name.split(" ")[0]}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {convs.length >= limit && (
            <button
              onClick={() => setLimit((l) => l + 50)}
              className="w-full border-t border-border py-3 text-sm font-medium text-primary-dark hover:bg-muted"
            >
              Muat lebih banyak
            </button>
          )}
        </div>
      </div>

      {/* Ruang obrolan + panel detail */}
      <div className={cn("min-w-0 flex-1 overflow-hidden", activeId ? "flex" : "hidden md:flex")}>
      <div className="flex min-w-0 flex-1 flex-col bg-[#fafafa]">
        {!active ? (
          <div className="flex flex-1 flex-col items-center justify-center text-muted-foreground">
            <MessageSquareDashed className="mb-3 h-10 w-10" />
            <p className="text-sm">Pilih percakapan untuk mulai membalas</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between border-b border-border bg-white px-4 py-3 md:px-5">
              <div className="flex min-w-0 items-center gap-2">
                <button
                  onClick={() => { setActiveId(null); setActive(null); }}
                  title="Kembali"
                  className="-ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-foreground hover:bg-muted md:hidden"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <div className="min-w-0">
                  <div className="truncate font-semibold">
                    {active.customer.name ?? active.customer.externalId}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {active.customer.externalId}
                    {accountLabel(active.channelAccountId)
                      ? ` · via ${accountLabel(active.channelAccountId)}`
                      : ""}
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5 md:gap-2">
                <button
                  onClick={() => { setShowPanel(true); setMobileDetail(true); }}
                  title="Tampilkan detail pelanggan"
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1.5 text-xs font-medium text-foreground/80 hover:bg-muted md:px-3",
                    showPanel ? "flex md:hidden" : "flex",
                  )}
                >
                  <Info className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Detail</span>
                </button>
                <button
                  onClick={() => toggleAi(active)}
                  title={active.aiPaused ? "AI dimatikan untuk chat ini — klik untuk aktifkan" : "Klik untuk ambil alih (matikan AI di chat ini)"}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-medium md:px-3",
                    active.aiPaused
                      ? "border-warning/40 bg-warning/10 text-warning"
                      : "border-border text-foreground/80 hover:bg-muted",
                  )}
                >
                  {active.aiPaused ? <Hand className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
                  <span className="hidden sm:inline">{active.aiPaused ? "Kamu handle" : "AI aktif"}</span>
                </button>
                <button
                  onClick={() => { window.location.href = `/jurnal?openFor=${active.customer.id}`; }}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1.5 text-xs font-medium text-foreground/80 hover:bg-muted md:px-3"
                >
                  <CalendarClock className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Catat Jurnal</span>
                </button>
                {meRole !== "AGENT" && (
                  <div className="relative">
                    <button
                      onClick={() => setShowReassign((v) => !v)}
                      disabled={reassigning}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1.5 text-xs font-medium text-foreground/80 hover:bg-muted md:px-3 disabled:opacity-50"
                    >
                      <UserCheck className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">
                        {active.assignedTo ? active.assignedTo.name.split(" ")[0] : "Unassigned"}
                      </span>
                    </button>
                    {showReassign && (
                      <div
                        className="absolute right-0 top-full z-30 mt-1 w-48 overflow-hidden rounded-lg border border-border bg-white shadow-lg"
                        onMouseLeave={() => setShowReassign(false)}
                      >
                        <button
                          onClick={() => reassignConv(active.id, null)}
                          className="flex w-full items-center px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted"
                        >
                          — Unassigned
                        </button>
                        {agentsList.map((a) => (
                          <button
                            key={a.id}
                            onClick={() => reassignConv(active.id, a.id)}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                          >
                            <span
                              className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                              style={{ backgroundColor: nameColor(a.name) }}
                            >
                              {a.name.charAt(0).toUpperCase()}
                            </span>
                            {a.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {win && (
                  <span
                    className={cn(
                      "hidden rounded-full px-2.5 py-1 text-xs font-medium sm:inline-flex",
                      win.active
                        ? "bg-success/10 text-success"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    Window: {win.label}
                  </span>
                )}
              </div>
            </div>

            <div ref={threadRef} className="min-w-0 flex-1 space-y-2 overflow-y-auto p-3 md:p-5">
              {active.messages.map((m, idx) => {
                const showDateSep =
                  idx === 0 ||
                  !isSameDay(m.createdAt, active.messages[idx - 1].createdAt);
                return (
                  <Fragment key={m.id}>
                    {showDateSep && (
                      <div className="flex items-center gap-3 py-1">
                        <div className="h-px flex-1 bg-border/60" />
                        <span className="rounded-full bg-muted px-3 py-1 text-[11px] font-medium text-muted-foreground">
                          {dateLabel(m.createdAt)}
                        </span>
                        <div className="h-px flex-1 bg-border/60" />
                      </div>
                    )}
                    {m.mediaType === "ctwa_ref" ? (() => {
                      let d: { sourceUrl?: string; headline?: string; body?: string; imageUrl?: string; adId?: string } = {};
                      try { d = JSON.parse(m.text ?? "{}"); } catch {}
                      return (
                        <div className="flex justify-center my-1">
                          <div className="w-full max-w-[75%] overflow-hidden rounded-xl border border-blue-200 bg-blue-50 text-sm shadow-sm md:max-w-[60%]">
                            {d.imageUrl && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={d.imageUrl} alt="" className="max-h-44 w-full object-cover" />
                            )}
                            <div className="p-2.5">
                              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-blue-500">Iklan yang diklik</div>
                              {d.headline && <div className="font-semibold text-foreground">{d.headline}</div>}
                              {d.body && <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{d.body}</div>}
                              {d.sourceUrl && (
                                <a href={d.sourceUrl} target="_blank" rel="noreferrer"
                                  className="mt-1.5 inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
                                  <ExternalLink className="h-3 w-3" />
                                  Lihat iklan
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })() : (
                    <div
                      className={cn(
                        "group flex items-center gap-1.5",
                        m.direction === "OUT" ? "justify-end" : "justify-start",
                      )}
                    >
                      {m.direction === "OUT" && (
                        <button
                          onClick={() => setReplyingTo(m)}
                          title="Balas pesan ini"
                          className="shrink-0 rounded-full p-1 text-muted-foreground transition hover:bg-muted hover:text-primary-dark opacity-100 md:opacity-0 md:group-hover:opacity-100"
                        >
                          <Reply className="h-4 w-4" />
                        </button>
                      )}
                      <div
                        className={cn(
                          "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm shadow-sm md:max-w-[70%]",
                          m.direction === "OUT"
                            ? "rounded-br-sm bg-primary text-white"
                            : "rounded-bl-sm bg-white",
                        )}
                      >
                        {/* kutipan bubble yang dibalas */}
                        {m.replyTo && (
                          <div
                            className={cn(
                              "mb-1 rounded-md border-l-2 px-2 py-1 text-xs",
                              m.direction === "OUT"
                                ? "border-white/60 bg-white/15 text-white/85"
                                : "border-primary bg-primary-soft/50 text-foreground/70",
                            )}
                          >
                            <div className="font-medium opacity-80">
                              {m.replyTo.direction === "OUT" ? "Anda" : "Pelanggan"}
                            </div>
                            <div className="line-clamp-2">{msgSummary(m.replyTo)}</div>
                          </div>
                        )}

                        {m.mediaUrl && m.mediaType === "image" && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <a href={m.mediaUrl} target="_blank">
                            <img src={m.mediaUrl} alt={m.text ?? ""} className="mb-1 max-h-56 rounded-lg" />
                          </a>
                        )}
                        {m.mediaUrl && m.mediaType === "video" && (
                          <video src={m.mediaUrl} controls className="mb-1 max-h-56 rounded-lg" />
                        )}
                        {m.mediaUrl && m.mediaType === "audio" && (
                          <audio src={m.mediaUrl} controls className="mb-1 w-56 max-w-full" />
                        )}
                        {m.mediaUrl && m.mediaType !== "image" && m.mediaType !== "video" && m.mediaType !== "audio" && (
                          <a
                            href={m.mediaUrl}
                            target="_blank"
                            download
                            className={cn(
                              "mb-1 flex items-center gap-1.5 rounded-lg border px-2 py-1.5",
                              m.direction === "OUT" ? "border-white/30" : "border-border",
                            )}
                          >
                            <FileText className="h-4 w-4" />
                            <span className="text-xs">{m.text ?? "File"}</span>
                          </a>
                        )}
                        {/* teks/caption — kecuali dokumen (namanya sudah di tombol) */}
                        {m.text && (!m.mediaUrl || m.mediaType === "image" || m.mediaType === "video" || m.mediaType === "audio") && (
                          <div className="whitespace-pre-wrap break-words">{renderTextWithLinks(m.text)}</div>
                        )}
                        <div
                          className={cn(
                            "mt-0.5 flex items-center justify-end gap-0.5 text-[10px]",
                            m.direction === "OUT" ? "text-white/70" : "text-muted-foreground",
                          )}
                        >
                          {clockTime(m.createdAt)}
                          {m.direction === "OUT" && <StatusTick status={m.status} />}
                        </div>
                        {m.direction === "OUT" && m.status === "FAILED" && (
                          <button
                            onClick={() => resendMessage(m.id)}
                            disabled={resendingId === m.id}
                            className="mt-1 flex items-center gap-1 self-end rounded bg-white/20 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-white/30 disabled:opacity-50"
                          >
                            {resendingId === m.id ? (
                              <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" className="opacity-25"/><path d="M4 12a8 8 0 018-8" className="opacity-75"/></svg>
                            ) : (
                              <AlertCircle className="h-3 w-3" />
                            )}
                            Kirim Ulang
                          </button>
                        )}
                      </div>
                      {m.direction === "IN" && (
                        <button
                          onClick={() => setReplyingTo(m)}
                          title="Balas pesan ini"
                          className="shrink-0 rounded-full p-1 text-muted-foreground transition hover:bg-muted hover:text-primary-dark opacity-100 md:opacity-0 md:group-hover:opacity-100"
                        >
                          <Reply className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    )}
                  </Fragment>
                );
              })}
              {/* AI Typing indicator */}
              {effectiveAiTyping && (
                <div className="flex items-end gap-2 px-3 py-2">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <Bot className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm bg-muted px-4 py-3">
                    <span className="h-2 w-2 animate-bounce rounded-full bg-primary/60 [animation-delay:0ms]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-primary/60 [animation-delay:150ms]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-primary/60 [animation-delay:300ms]" />
                  </div>
                  <span className="mb-1 text-[10px] text-muted-foreground">AI sedang membalas...</span>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            <div className="border-t border-border bg-white p-3">
              {/* Window tutup — tampilkan template picker */}
              {win && !win.active ? (
                <div>
                  <div className="mb-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    <span>Window 24 jam sudah tutup. Gunakan template untuk memulai percakapan.</span>
                  </div>
                  {tplErr && (
                    <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
                      <span>{tplErr}</span>
                      <button onClick={() => setTplErr(null)} className="shrink-0 text-red-400 hover:text-red-600"><X className="h-3.5 w-3.5" /></button>
                    </div>
                  )}
                  {!tplOpen ? (
                    <button
                      onClick={() => setTplOpen(true)}
                      className="flex w-full items-center justify-center gap-2 rounded-xl border border-primary bg-primary-soft px-4 py-2.5 text-sm font-medium text-primary-dark hover:bg-primary/10"
                    >
                      <Mail className="h-4 w-4" />
                      Kirim Template
                    </button>
                  ) : (
                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">Pilih template (APPROVED)</span>
                        <button onClick={() => { setTplOpen(false); setTplErr(null); }} className="text-muted-foreground hover:text-danger">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      {templates.length === 0 ? (
                        <p className="py-4 text-center text-xs text-muted-foreground">Belum ada template APPROVED. Sync dulu di menu Template.</p>
                      ) : (
                        <div className="max-h-64 space-y-1 overflow-y-auto">
                          {templates.map((t) => (
                            <button
                              key={t.id}
                              disabled={tplSending}
                              onClick={() => sendTemplate(t.name, t.language)}
                              className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-left hover:border-primary hover:bg-primary-soft/30 disabled:opacity-50"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-mono text-xs font-semibold text-primary-dark">{t.name}</span>
                                <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{t.language}</span>
                              </div>
                              {t.bodyText && (
                                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{t.bodyText}</p>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                      {tplSending && (
                        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                          <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" className="opacity-25"/><path d="M4 12a8 8 0 018-8" className="opacity-75"/></svg>
                          Mengirim template...
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {showQR && qrMatches.length > 0 && (
                    <div className="mb-2 max-h-48 overflow-y-auto rounded-lg border border-border bg-white shadow-sm">
                      {qrMatches.map((q) => (
                        <button
                          key={q.id}
                          onClick={() => applyQR(q)}
                          className="flex w-full items-center gap-2 border-b border-border px-3 py-2 text-left last:border-0 hover:bg-muted"
                        >
                          <span className="rounded bg-primary-soft px-1.5 py-0.5 font-mono text-xs font-semibold text-primary-dark">
                            {q.shortcut}
                          </span>
                          <span className="truncate text-xs text-muted-foreground">
                            {q.text ?? (q.attachments?.length ? `${q.attachments.length} lampiran` : "")}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  {uploading && (
                    <div className="mb-2 flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                      <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" className="opacity-25"/><path d="M4 12a8 8 0 018-8" className="opacity-75"/></svg>
                      Mengunggah file...
                    </div>
                  )}
                  {uploadErr && (
                    <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
                      <span>{uploadErr}</span>
                      <button onClick={() => setUploadErr(null)} className="shrink-0 text-red-400 hover:text-red-600"><X className="h-3.5 w-3.5" /></button>
                    </div>
                  )}
                  {sendErr && (
                    <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
                      <span>{sendErr}</span>
                      <button onClick={() => setSendErr(null)} className="shrink-0 text-red-400 hover:text-red-600"><X className="h-3.5 w-3.5" /></button>
                    </div>
                  )}
                  {pending.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-2">
                      {pending.map((a, i) => (
                        <div key={i} className="relative">
                          {a.type === "image" ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={a.url} alt="" className="h-14 w-14 rounded-md border border-border object-cover" />
                          ) : (
                            <div className="flex h-14 w-14 flex-col items-center justify-center rounded-md border border-border p-1 text-center">
                              <FileText className="h-4 w-4 text-muted-foreground" />
                              <span className="mt-0.5 line-clamp-1 text-[9px]">{a.name}</span>
                            </div>
                          )}
                          <button
                            onClick={() => setPending((arr) => arr.filter((_, j) => j !== i))}
                            className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-danger text-white"
                          >
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {replyingTo && (
                    <div className="mb-2 flex items-center gap-2 rounded-lg border-l-2 border-primary bg-primary-soft/40 px-3 py-1.5">
                      <Reply className="h-4 w-4 shrink-0 text-primary-dark" />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium text-primary-dark">
                          Membalas {replyingTo.direction === "OUT" ? "pesan Anda" : "pelanggan"}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">{msgSummary(replyingTo)}</div>
                      </div>
                      <button onClick={() => setReplyingTo(null)} className="shrink-0 text-muted-foreground hover:text-danger">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  )}

                  <div className="flex items-end gap-2">
                    <div className="relative shrink-0">
                      <button
                        onClick={() => setAttachMenu((v) => !v)}
                        title="Lampirkan"
                        className="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
                      >
                        <Paperclip className="h-[18px] w-[18px]" />
                      </button>
                      {attachMenu && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setAttachMenu(false)} />
                          <div className="absolute bottom-12 left-0 z-20 w-44 overflow-hidden rounded-xl border border-border bg-white py-1 shadow-lg">
                            <button
                              onClick={() => { setAttachMenu(false); fileRef.current?.click(); }}
                              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-muted"
                            >
                              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-soft text-primary-dark">
                                <ImageIcon className="h-4 w-4" />
                              </span>
                              Foto &amp; Video
                            </button>
                            <button
                              onClick={() => { setAttachMenu(false); docRef.current?.click(); }}
                              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-muted"
                            >
                              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-soft text-primary-dark">
                                <FileText className="h-4 w-4" />
                              </span>
                              File / Dokumen
                            </button>
                            <button
                              onClick={openLibraryPicker}
                              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-muted"
                            >
                              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-soft text-primary-dark">
                                <LayoutGrid className="h-4 w-4" />
                              </span>
                              Dari Library
                            </button>
                          </div>
                        </>
                      )}
                      {/* Modal Library Picker */}
                      {showLibraryPicker && (
                        <>
                          <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setShowLibraryPicker(false)} />
                          <div className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,680px)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-border bg-white shadow-xl flex flex-col" style={{ maxHeight: "75vh" }}>
                            <div className="flex items-center justify-between border-b border-border px-4 py-3 shrink-0">
                              <span className="font-semibold text-sm">Pilih dari Media Library</span>
                              <button onClick={() => setShowLibraryPicker(false)} className="text-muted-foreground hover:text-foreground">
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                            <div className="flex flex-1 min-h-0">
                              {/* Sidebar folder */}
                              {libraryFolders.length > 0 && (
                                <div className="w-40 shrink-0 border-r border-border overflow-y-auto py-2">
                                  <button onClick={() => loadLibraryFolder(null)}
                                    className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 transition-colors ${libraryFolder === null ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted text-foreground/80"}`}>
                                    <span>Semua</span>
                                  </button>
                                  {libraryFolders.map((f) => (
                                    <button key={f.id} onClick={() => loadLibraryFolder(f.id)}
                                      className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 transition-colors ${libraryFolder === f.id ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted text-foreground/80"}`}>
                                      <span className="truncate">{f.name}</span>
                                    </button>
                                  ))}
                                </div>
                              )}
                              {/* Grid media */}
                              <div className="flex-1 overflow-y-auto p-3">
                                {libraryLoading ? (
                                  <div className="py-12 text-center text-sm text-muted-foreground">Memuat...</div>
                                ) : libraryItems.length === 0 ? (
                                  <div className="py-12 text-center text-sm text-muted-foreground">Belum ada media di sini.</div>
                                ) : (
                                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                                    {libraryItems.map((item) => (
                                      <button
                                        key={item.id}
                                        onClick={() => pickFromLibrary(item)}
                                        className="group relative overflow-hidden rounded-lg border border-border bg-muted/30 hover:border-primary hover:ring-2 hover:ring-primary/30 transition"
                                      >
                                        {item.type.startsWith("image/") || item.type === "image" ? (
                                          // eslint-disable-next-line @next/next/no-img-element
                                          <img src={item.url} alt={item.name} className="aspect-square w-full object-cover" />
                                        ) : (
                                          <div className="flex aspect-square w-full flex-col items-center justify-center gap-1 p-2">
                                            <FileText className="h-6 w-6 text-muted-foreground" />
                                            <span className="line-clamp-2 text-[10px] text-center text-muted-foreground">{item.name}</span>
                                          </div>
                                        )}
                                        <div className="absolute inset-x-0 bottom-0 bg-black/60 px-1.5 py-1 opacity-0 group-hover:opacity-100 transition">
                                          <span className="truncate text-[10px] text-white block">{item.name}</span>
                                        </div>
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                    <input ref={fileRef} type="file" accept="image/*,video/*" multiple onChange={onFiles} className="hidden" />
                    <input ref={docRef} type="file" multiple onChange={onFiles} className="hidden" />
                    <div className="relative shrink-0">
                      <button
                        onClick={() => setShowEmoji((v) => !v)}
                        title="Emoji"
                        className="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
                      >
                        <Smile className="h-[18px] w-[18px]" />
                      </button>
                      {showEmoji && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setShowEmoji(false)} />
                          <EmojiPicker
                            tab={emojiTab}
                            onTab={setEmojiTab}
                            onPick={(e) => {
                              setShowEmoji(false);
                              const el = composerRef.current;
                              if (!el) { setText((t) => t + e); return; }
                              const start = el.selectionStart ?? text.length;
                              const end = el.selectionEnd ?? text.length;
                              const next = text.slice(0, start) + e + text.slice(end);
                              setText(next);
                              requestAnimationFrame(() => {
                                el.focus();
                                el.setSelectionRange(start + e.length, start + e.length);
                              });
                            }}
                          />
                        </>
                      )}
                    </div>
                    <textarea
                      ref={composerRef}
                      value={text}
                      onChange={(e) => onText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          send();
                        }
                      }}
                      rows={3}
                      disabled={effectiveAiTyping}
                      placeholder={effectiveAiTyping ? "AI sedang membalas — klik Human Mode untuk ambil alih..." : "Tulis balasan atau /shortcut...  (Enter kirim, Shift+Enter baris baru)"}
                      className={"max-h-64 min-h-[80px] flex-1 resize-none rounded-2xl border border-input bg-white px-4 py-2.5 text-sm leading-5 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" + (effectiveAiTyping ? " cursor-not-allowed opacity-50" : "")}
                    />
                    <button
                      onClick={send}
                      disabled={sending || uploading || (!text.trim() && pending.length === 0) || effectiveAiTyping}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-white transition hover:bg-primary-dark disabled:opacity-50"
                    >
                      <Send className="h-[18px] w-[18px]" />
                    </button>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
      {/* panel detail — inline di desktop */}
      {active && showPanel && (
        <div className="hidden md:flex">
          <CustomerPanel
            customerId={active.customer.id}
            conversationId={active.id}
            aiPaused={active.aiPaused}
            onClose={() => setShowPanel(false)}
            onUpdated={() => {
              loadConvs();
              if (activeId) loadActive(activeId);
            }}
          />
        </div>
      )}
      {/* panel detail — overlay di mobile */}
      {active && mobileDetail && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="flex-1 bg-black/40" onClick={() => setMobileDetail(false)} />
          <CustomerPanel
            customerId={active.customer.id}
            conversationId={active.id}
            aiPaused={active.aiPaused}
            onClose={() => setMobileDetail(false)}
            onUpdated={() => {
              loadConvs();
              if (activeId) loadActive(activeId);
            }}
          />
        </div>
      )}
      </div>

      {showSim && (
        <SimulateModal
          onClose={() => setShowSim(false)}
          onDone={async () => {
            setShowSim(false);
            await loadConvs();
          }}
        />
      )}

      {jurnalToast && (
        <div className="fixed bottom-6 right-6 z-50 w-80 rounded-[var(--radius-lg)] border border-border bg-white p-4 shadow-xl">
          <p className="mb-1 text-sm font-semibold text-foreground">Jangan lupa catat jurnal 📝</p>
          <p className="mb-3 text-sm text-muted-foreground">
            Lead <span className="font-medium text-foreground">{jurnalToast.name}</span> belum dicatat hari ini.
          </p>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => {
                sessionStorage.setItem(`j-alerted-${jurnalToast.customerId}`, "1");
                setJurnalToast(null);
              }}
              className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
            >
              Nanti
            </button>
            <button
              onClick={() => {
                sessionStorage.setItem(`j-alerted-${jurnalToast.customerId}`, "1");
                setJurnalToast(null);
                window.location.href = `/jurnal?openFor=${jurnalToast.customerId}`;
              }}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-dark"
            >
              Catat Jurnal
            </button>
          </div>
        </div>
      )}

      {guestToast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full border border-amber-200 bg-amber-50 px-5 py-2.5 text-sm font-medium text-amber-700 shadow-lg">
          Akses terbatas — mode tamu tidak bisa mengirim pesan
        </div>
      )}

    </div>
  );
}

function ScheduleFollowUpModal({
  conversationId,
  customerName,
  onClose,
}: {
  conversationId: string;
  customerName: string;
  onClose: () => void;
}) {
  const nowLocal = () => {
    const d = new Date(Date.now() + 60 * 60 * 1000); // default +1 jam
    const pad = (n: number) => String(n).padStart(2, "0");
    return {
      date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
      time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
    };
  };
  const init = nowLocal();
  const [date, setDate] = useState(init.date);
  const [time, setTime] = useState(init.time);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);

  async function submit() {
    if (!date || !time) return;
    setBusy(true);
    const scheduledAt = new Date(`${date}T${time}`).toISOString();
    await fetch("/api/followups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId, scheduledAt, note }),
    });
    setBusy(false);
    setOk(true);
    setTimeout(onClose, 900);
  }

  const field = "mt-1 h-10 w-full rounded-md border border-input px-3 text-sm outline-none focus:border-primary";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-[var(--radius-lg)] bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold">Jadwalkan Follow Up</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">Untuk: {customerName}</p>
        {ok ? (
          <div className="rounded-md bg-success/10 px-3 py-3 text-center text-sm font-medium text-success">
            Follow up dijadwalkan ✓
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium">Tanggal</label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} />
              </div>
              <div>
                <label className="text-xs font-medium">Jam</label>
                <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={field} />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium">Catatan (opsional)</label>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="mis. tawarkan paket B" className={field} />
            </div>
            <button
              onClick={submit}
              disabled={busy}
              className="h-10 w-full rounded-md bg-primary font-medium text-white hover:bg-primary-dark disabled:opacity-50"
            >
              {busy ? "Menyimpan..." : "Jadwalkan"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function SimulateModal({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: () => void;
}) {
  const [from, setFrom] = useState("6281200000001");
  const [name, setName] = useState("Calon Pembeli");
  const [text, setText] = useState("Halo, mau tanya produknya");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    await fetch("/api/inbox/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from, name, text }),
    });
    setBusy(false);
    onDone();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-[var(--radius-lg)] bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold">Simulasi chat masuk</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium">Nomor (from)</label>
            <input value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 h-10 w-full rounded-md border border-input px-3 text-sm outline-none focus:border-primary" />
          </div>
          <div>
            <label className="text-xs font-medium">Nama</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 h-10 w-full rounded-md border border-input px-3 text-sm outline-none focus:border-primary" />
          </div>
          <div>
            <label className="text-xs font-medium">Pesan</label>
            <input value={text} onChange={(e) => setText(e.target.value)} className="mt-1 h-10 w-full rounded-md border border-input px-3 text-sm outline-none focus:border-primary" />
          </div>
          <button
            onClick={submit}
            disabled={busy || !from.trim() || !text.trim()}
            className="mt-1 h-10 w-full rounded-md bg-primary font-medium text-white hover:bg-primary-dark disabled:opacity-50"
          >
            {busy ? "Mengirim..." : "Kirim pesan masuk"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── EmojiPicker ─────────────────────────────────────────────────────────────
const EMOJI_TABS = [
  {
    label: "😊",
    title: "Wajah",
    emojis: [
      "😀","😃","😄","😁","😆","😅","😂","🤣","😊","😇",
      "🙂","🙃","😉","😌","😍","🥰","😘","😗","😙","😚",
      "😋","😛","😝","😜","🤪","🤨","🧐","🤓","😎","🥸",
      "🤩","🥳","😏","😒","😞","😔","😟","😕","🙁","☹️",
      "😣","😖","😫","😩","🥺","😢","😭","😤","😠","😡",
      "🤬","🤯","😳","🥵","🥶","😱","😨","😰","😥","😓",
      "🤗","🤔","🫣","🤭","🫢","🫡","🤫","🫠","🤥","😶",
      "😑","😬","🙄","😯","😦","😧","😮","😲","🥱","😴",
      "🤤","😪","😵","🤐","🥴","🤢","🤮","🤧","😷","🤒",
      "🤕","🤑","🤠","😈","👿","👹","👺","🤡","💩","👻",
      "💀","☠️","👽","👾","🤖","🎃","😺","😸","😹","😻",
    ],
  },
  {
    label: "👋",
    title: "Gestur",
    emojis: [
      "👋","🤚","🖐️","✋","🖖","🫱","🫲","🫳","🫴","👌",
      "🤌","🤏","✌️","🤞","🫰","🤟","🤘","🤙","👈","👉",
      "👆","🖕","👇","☝️","🫵","👍","👎","✊","👊","🤛",
      "🤜","👏","🙌","🫶","👐","🤲","🤝","🙏","✍️","💅",
      "💪","🦾","🦿","👂","🦻","👃","👀","👁️","👅","👄",
      "🫦","💋","💘","💝","💖","💗","💓","💞","💕","💟",
      "❣️","💔","❤️","🧡","💛","💚","💙","💜","🤎","🖤",
      "🤍","❤️‍🔥","❤️‍🩹","💯","💢","💥","💫","💦","💨","🕳️",
    ],
  },
  {
    label: "🐶",
    title: "Hewan",
    emojis: [
      "🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐨","🐯",
      "🦁","🐮","🐷","🐽","🐸","🐵","🙈","🙉","🙊","🐒",
      "🦆","🦅","🦉","🦇","🐺","🐗","🐴","🦄","🐝","🐛",
      "🦋","🐌","🐞","🐜","🦟","🦗","🕷️","🦂","🐢","🐍",
      "🦎","🐙","🦑","🦐","🦀","🐡","🐠","🐟","🐬","🐳",
      "🐋","🦈","🐊","🐅","🐆","🦓","🦍","🦧","🦣","🐘",
      "🦛","🦏","🐪","🐫","🦒","🦘","🦬","🐃","🐂","🐄",
      "🐎","🐖","🐏","🐑","🦙","🐐","🦌","🐓","🦃","🦤",
    ],
  },
  {
    label: "🍎",
    title: "Makanan",
    emojis: [
      "🍎","🍐","🍊","🍋","🍌","🍉","🍇","🍓","🫐","🍈",
      "🍒","🍑","🥭","🍍","🥥","🥝","🍅","🍆","🥑","🫒",
      "🥦","🥬","🥒","🌶️","🫑","🧄","🧅","🥔","🌽","🥕",
      "🥗","🥘","🫕","🍲","🍛","🍜","🍝","🍠","🍢","🍣",
      "🍤","🍙","🍚","🍱","🥟","🍥","🥮","🍡","🥠","🥡",
      "🍦","🍧","🍨","🍩","🍪","🎂","🍰","🧁","🥧","🍫",
      "🍬","🍭","🍮","🍯","🍼","🥛","☕","🍵","🧃","🥤",
      "🧋","🍺","🍻","🥂","🍷","🍸","🍹","🧉","🍾","🥃",
    ],
  },
  {
    label: "⚽",
    title: "Aktivitas",
    emojis: [
      "⚽","🏀","🏈","⚾","🎾","🏐","🏉","🎱","🏓","🏸",
      "🏒","🥊","🥅","⛳","🎿","🛷","🥌","🎯","🎳","🎰",
      "🎲","🧩","🪀","🪁","🎮","🕹️","🎭","🎨","🖼️","🎪",
      "🤹","🎤","🎧","🎼","🎵","🎶","🎹","🥁","🪘","🎸",
      "🎺","🎻","🪕","🎙️","🎚️","🎛️","📻","📺","📷","📸",
      "🏆","🥇","🥈","🥉","🏅","🎖️","🏵️","🎗️","🎫","🎟️",
      "🤸","🏋️","⛹️","🤺","🤼","🤾","🏌️","🧗","🚴","🏊",
      "🏄","🧘","🏇","⛷️","🏂","🪂","🤿","🧁","🎠","🎡",
    ],
  },
  {
    label: "🚀",
    title: "Perjalanan",
    emojis: [
      "🚗","🚕","🚙","🚌","🚎","🏎️","🚓","🚑","🚒","🚐",
      "🛻","🚚","🚛","🚜","🏍️","🛵","🚲","🛴","🛹","🛼",
      "🚁","🛸","🚀","✈️","🛫","🛬","🛩️","💺","🚢","⛵",
      "🚤","🛥️","🛳️","⛴️","🚂","🚃","🚄","🚅","🚆","🚇",
      "🏠","🏡","🏢","🏥","🏦","🏨","🏩","🏪","🏫","🏬",
      "🏭","🏗️","🏘️","🏚️","🗼","🗽","⛪","🕌","🛕","🕍",
      "⛩️","🗾","🎑","🏞️","🌅","🌄","🌠","🎇","🎆","🌇",
      "🌆","🏙️","🌃","🌌","🌉","🌁","🗺️","🧭","🌏","🌍",
    ],
  },
  {
    label: "💡",
    title: "Objek",
    emojis: [
      "⌚","📱","📲","💻","⌨️","🖥️","🖨️","🖱️","🖲️","💽",
      "💾","💿","📀","📷","📸","📹","🎥","📽️","🎞️","📞",
      "☎️","📟","📠","📡","🔋","🪫","🔌","💡","🔦","🕯️",
      "🪔","💰","💴","💵","💶","💷","💸","💳","🪙","💎",
      "🔑","🗝️","🔨","🪓","⛏️","⚒️","🛠️","🔧","🪛","🔩",
      "⚙️","🗜️","⚖️","🦯","🔗","⛓️","🪝","🧲","🔫","🪃",
      "🏹","🛡️","🔮","💈","⚗️","🔭","🔬","🩺","🩻","💊",
      "💉","🩹","🩼","🧬","🦠","🧪","🧫","🧲","📦","📫",
    ],
  },
  {
    label: "✨",
    title: "Simbol",
    emojis: [
      "✨","🌟","💫","⭐","🌙","☀️","🌤️","⛅","🌥️","☁️",
      "🌦️","🌧️","⛈️","🌩️","🌨️","❄️","☃️","⛄","🌬️","💨",
      "💧","💦","🌊","🔥","💥","🌈","☂️","☔","⚡","🌪️",
      "🎉","🎊","🎈","🎁","🎀","🎗️","🎟️","🔑","🗝️","🏷️",
      "✅","❌","❎","⭕","🔴","🟠","🟡","🟢","🔵","🟣",
      "⚫","⚪","🟤","🔶","🔷","🔸","🔹","🔺","🔻","💠",
      "🔘","🔲","🔳","▪️","▫️","◾","◽","◼️","◻️","🔈",
      "🔉","🔊","📣","📢","🔔","🔕","💬","💭","🗯️","📌",
    ],
  },
];

function EmojiPicker({
  tab,
  onTab,
  onPick,
}: {
  tab: number;
  onTab: (i: number) => void;
  onPick: (e: string) => void;
}) {
  return (
    <div className="absolute bottom-14 left-0 z-20 w-72 rounded-xl border border-border bg-white shadow-xl">
      <div className="flex overflow-x-auto border-b border-border px-1 pt-1">
        {EMOJI_TABS.map((t, i) => (
          <button
            key={i}
            onClick={() => onTab(i)}
            title={t.title}
            className={
              "shrink-0 rounded-t px-2 py-1.5 text-base transition-colors " +
              (tab === i ? "bg-primary/10 font-bold" : "hover:bg-muted")
            }
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="h-52 overflow-y-auto p-2">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {EMOJI_TABS[tab].title}
        </div>
        <div className="grid grid-cols-8 gap-0.5">
          {EMOJI_TABS[tab].emojis.map((e, i) => (
            <button
              key={i}
              onClick={() => onPick(e)}
              className="flex h-9 w-9 items-center justify-center rounded text-xl hover:bg-muted"
            >
              {e}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
