import type { Ability } from "./rbac";
import { can } from "./rbac";
import type { Role } from "@prisma/client";

export type NavItem = {
  label: string;
  href: string;
  icon: string; // nama ikon lucide, dipetakan di sidebar
  ability?: Ability; // kalau ada, item hanya tampil bila role punya izin ini
  exact?: boolean; // aktif hanya jika pathname persis sama (bukan startsWith)
};

export type NavGroup = { title: string; items: NavItem[] };

export const NAV: NavGroup[] = [
  {
    title: "Percakapan",
    items: [
      { label: "Dasbor", href: "/dashboard", icon: "LayoutDashboard" },
      { label: "Kotak Masuk", href: "/inbox", icon: "MessagesSquare" },
      { label: "Follow Up", href: "/followup", icon: "CalendarClock", exact: true },
      { label: "Kalender Follow Up", href: "/followup/kalender", icon: "CalendarDays" },
    ],
  },
  {
    title: "CRM",
    items: [
      { label: "Pasien & Lead", href: "/customers", icon: "Users" },
      { label: "Paket Treatment", href: "/paket", icon: "Package" },
      { label: "Jurnal Sales", href: "/jurnal", icon: "BookOpen", exact: true },
      { label: "Analitik", href: "/jurnal/analytics", icon: "BarChart2" },
      { label: "Pipeline", href: "/pipeline", icon: "KanbanSquare" },
      { label: "Broadcast", href: "/broadcast", icon: "Megaphone", ability: "broadcast" },
      { label: "Template", href: "/templates", icon: "FileText", ability: "manage_templates" },
      { label: "Media", href: "/media", icon: "Images" },
      { label: "Automasi", href: "/automation", icon: "Zap", ability: "manage_automation" },
      { label: "Tracking Links", href: "/tracking", icon: "Link2", ability: "manage_automation" },
      { label: "Analisa Iklan", href: "/analisa-iklan", icon: "TrendingUp", ability: "view_reports" },
      { label: "Laporan Bulanan", href: "/report", icon: "FileBarChart", ability: "view_reports" },
      { label: "Resume AI", href: "/resume", icon: "BrainCircuit", ability: "view_reports" },
      { label: "Target Tim", href: "/targets", icon: "Target", ability: "view_reports" },
      { label: "Evaluasi Tim", href: "/evaluation", icon: "ClipboardCheck", ability: "manage_owner" },
    ],
  },
  {
    title: "Konfigurasi",
    items: [
      { label: "AI Chatbot", href: "/ai", icon: "Bot", ability: "manage_ai" },
      { label: "Tim", href: "/team", icon: "UserCog", ability: "view_reports" },
      { label: "Channel", href: "/channels", icon: "Plug", ability: "manage_channels" },
      { label: "Pengaturan CRM", href: "/crm-settings", icon: "SlidersHorizontal", ability: "manage_crm_settings" },
      { label: "Tanda Minat", href: "/settings/minat", icon: "Sparkles", ability: "manage_crm_settings" },
      { label: "Pengaturan", href: "/settings", icon: "Settings" },
    ],
  },
  {
    title: "Developer",
    items: [
      { label: "API & Webhook", href: "/developers", icon: "Code2", ability: "manage_channels" },
    ],
  },
];

export function navFor(role: Role): NavGroup[] {
  return NAV.map((g) => ({
    title: g.title,
    items: g.items.filter((it) => !it.ability || can(role, it.ability)),
  })).filter((g) => g.items.length > 0);
}
