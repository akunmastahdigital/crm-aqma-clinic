// RBAC — dibuat fleksibel biar gampang diedit nanti.
// Kalau mau geser izin, cukup ubah ROLE_ABILITIES di bawah.

import type { Role } from "@prisma/client";

export type Ability =
  | "view_all_chats" // lihat semua chat semua agent
  | "view_own_chats" // lihat chat yang di-assign + antrian
  | "assign_chats" // assign / pindah chat ke agent
  | "broadcast" // kirim broadcast massal
  | "manage_channels" // sambung/putus WA/IG/dll
  | "manage_ai" // atur AI chatbot
  | "manage_automation" // atur balasan cepat / auto reply / tag
  | "manage_templates" // kelola template pesan
  | "manage_crm_settings" // pipeline, skor, field kustom
  | "manage_users" // undang / kelola user & role
  | "manage_owner" // hal khusus owner (hapus data, ganti owner)
  | "view_reports"; // laporan & statistik tim

export const ROLE_LABEL: Record<Role, string> = {
  OWNER: "Owner",
  SUPERADMIN: "Superadmin",
  SUPERVISOR: "Supervisor Agent",
  AGENT: "Agent",
  GUEST: "Tamu (View Only)",
  VIEWER: "Viewer (Read Only)",
};

// Matrix izin per role — SUMBER KEBENARAN, tinggal edit di sini.
export const ROLE_ABILITIES: Record<Role, Ability[]> = {
  OWNER: [
    "view_all_chats",
    "assign_chats",
    "broadcast",
    "manage_channels",
    "manage_ai",
    "manage_automation",
    "manage_templates",
    "manage_crm_settings",
    "manage_users",
    "manage_owner",
    "view_reports",
  ],
  SUPERADMIN: [
    "view_all_chats",
    "assign_chats",
    "broadcast",
    "manage_channels",
    "manage_ai",
    "manage_automation",
    "manage_templates",
    "manage_crm_settings",
    "manage_users",
    "view_reports",
  ],
  SUPERVISOR: [
    "view_all_chats",
    "assign_chats",
    "broadcast",
    "manage_automation",
    "manage_templates",
    "view_reports",
  ],
  AGENT: ["view_own_chats"],
  // Tamu: tampilan sama dengan OWNER, tapi semua aksi diblokir di handler/API
  GUEST: [
    "view_all_chats",
    "assign_chats",
    "broadcast",
    "manage_channels",
    "manage_ai",
    "manage_automation",
    "manage_templates",
    "manage_crm_settings",
    "manage_users",
    "manage_owner",
    "view_reports",
  ],
  // Viewer: tampilan sama dengan OWNER, semua aksi diblokir di UI dan API
  VIEWER: [
    "view_all_chats",
    "assign_chats",
    "broadcast",
    "manage_channels",
    "manage_ai",
    "manage_automation",
    "manage_templates",
    "manage_crm_settings",
    "manage_users",
    "manage_owner",
    "view_reports",
  ],
};

// Role yang hanya boleh melihat. Sengaja dipisah dari ROLE_ABILITIES:
// GUEST & VIEWER memang diberi ability seluas OWNER supaya tampilan menunya sama,
// jadi matrix ability TIDAK bisa dipakai untuk memblokir aksi mereka.
// Setiap handler yang mengubah atau menghapus data WAJIB memanggil isReadOnly().
const READ_ONLY_ROLES: Role[] = ["GUEST", "VIEWER"];

export function isReadOnly(role: Role): boolean {
  return READ_ONLY_ROLES.includes(role);
}

export function can(role: Role, ability: Ability): boolean {
  return ROLE_ABILITIES[role]?.includes(ability) ?? false;
}

export function canAny(role: Role, abilities: Ability[]): boolean {
  return abilities.some((a) => can(role, a));
}
