"use server";

// =====================================================================
// SERVER ACTIONS · Next.js App Router
// Kapselt sämtliche Schreiboperationen serverseitig (kein API-Layer
// nötig). Nutzt den Supabase Server-Client (RLS greift automatisch
// anhand der eingeloggten Session).
// =====================================================================

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  calculateBestDays,
  expandRecurringToSlots,
} from "@/lib/matching-algorithm";
import type { DayMatch, Preference, TimeSlot } from "@/types";

// ---------------------------------------------------------------------
// Verfügbarkeiten eintragen
// ---------------------------------------------------------------------

export async function upsertRecurringAvailability(input: {
  groupId: string;
  weekday: number;
  startTime: string;
  endTime: string;
  preference: Preference;
}) {
  const supabase = await createServerSupabaseClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Nicht angemeldet.");

  const { error } = await supabase.from("recurring_availability").insert({
    user_id: auth.user.id,
    group_id: input.groupId,
    weekday: input.weekday,
    start_time: input.startTime,
    end_time: input.endTime,
    preference: input.preference,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/calendar");
}

export async function upsertDateAvailability(input: {
  groupId: string;
  date: string;
  startTime?: string;
  endTime?: string;
  status: "available" | "blocked" | "maybe";
  preference?: Preference;
  note?: string;
}) {
  const supabase = await createServerSupabaseClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Nicht angemeldet.");

  const { error } = await supabase.from("date_availability").upsert(
    {
      user_id: auth.user.id,
      group_id: input.groupId,
      date: input.date,
      start_time: input.startTime ?? null,
      end_time: input.endTime ?? null,
      status: input.status,
      preference: input.preference ?? null,
      note: input.note ?? null,
    },
    { onConflict: "user_id,group_id,date,start_time" }
  );
  if (error) throw new Error(error.message);

  revalidatePath("/calendar");
}

// ---------------------------------------------------------------------
// Matching: beste Tage für einen Zeitraum berechnen
// ---------------------------------------------------------------------

export async function getBestDaysForGroup(
  groupId: string,
  dateRange: { from: string; to: string },
  topN = 3
): Promise<DayMatch[]> {
  const supabase = await createServerSupabaseClient();

  const [{ data: members }, { data: recurring }, { data: dateSpecific }] =
    await Promise.all([
      supabase.from("group_members").select("user_id").eq("group_id", groupId),
      supabase
        .from("recurring_availability")
        .select("user_id, weekday, start_time, end_time, preference")
        .eq("group_id", groupId),
      supabase
        .from("date_availability")
        .select("user_id, date, start_time, end_time, status, preference")
        .eq("group_id", groupId)
        .gte("date", dateRange.from)
        .lte("date", dateRange.to),
    ]);

  const groupMemberIds = (members ?? []).map((m) => m.user_id);

  const recurringSlots = expandRecurringToSlots(
    (recurring ?? []).map((r) => ({
      userId: r.user_id,
      weekday: r.weekday,
      startTime: r.start_time,
      endTime: r.end_time,
      preference: r.preference as Preference,
    })),
    dateRange
  );

  const blockedUserDates = new Set<string>();
  const dateSlots: TimeSlot[] = [];

  for (const d of dateSpecific ?? []) {
    if (d.status === "blocked") {
      blockedUserDates.add(`${d.user_id}__${d.date}`);
      continue;
    }
    if (d.start_time && d.end_time) {
      dateSlots.push({
        userId: d.user_id,
        date: d.date,
        startTime: d.start_time,
        endTime: d.end_time,
        preference: (d.preference ?? 2) as Preference,
        source: "date-specific",
      });
    }
  }

  return calculateBestDays({
    slots: [...recurringSlots, ...dateSlots],
    blockedUserDates,
    groupMemberIds,
    dateRange,
    topN,
  });
}

// ---------------------------------------------------------------------
// Event erstellen / RSVP
// ---------------------------------------------------------------------

export async function createEvent(input: {
  groupId: string;
  eventDate: string;
  startTime: string;
  endTime?: string;
  hostId?: string;
  hostCapacity?: number;
  gameId?: string;
  matchScore?: number;
}) {
  const supabase = await createServerSupabaseClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Nicht angemeldet.");

  const { data: event, error } = await supabase
    .from("events")
    .insert({
      group_id: input.groupId,
      event_date: input.eventDate,
      start_time: input.startTime,
      end_time: input.endTime,
      host_id: input.hostId,
      host_capacity: input.hostCapacity,
      game_id: input.gameId,
      match_score: input.matchScore,
      created_by: auth.user.id,
      status: "proposed",
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

  // Alle Gruppenmitglieder automatisch als "invited" eintragen
  const { data: members } = await supabase
    .from("group_members")
    .select("user_id")
    .eq("group_id", input.groupId);

  if (members?.length) {
    await supabase.from("event_participants").insert(
      members.map((m) => ({
        event_id: event.id,
        user_id: m.user_id,
        status: m.user_id === auth.user!.id ? "accepted" : "invited",
      }))
    );
  }

  await maybeNotifyDiscord(input.groupId, "event_confirmed", event);
  revalidatePath("/dashboard");
  return event;
}

export async function respondToEvent(
  eventId: string,
  status: "accepted" | "declined" | "maybe"
) {
  const supabase = await createServerSupabaseClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Nicht angemeldet.");

  const { error } = await supabase
    .from("event_participants")
    .update({ status, responded_at: new Date().toISOString() })
    .eq("event_id", eventId)
    .eq("user_id", auth.user.id);
  if (error) throw new Error(error.message);

  revalidatePath(`/events/${eventId}`);
}

// ---------------------------------------------------------------------
// Spiel-Vorschlag basierend auf zugesagter Teilnehmerzahl & Zeitfenster
// ---------------------------------------------------------------------

export async function suggestGamesForEvent(
  groupId: string,
  confirmedPlayerCount: number,
  availableMinutes: number
) {
  const supabase = await createServerSupabaseClient();
  const { data: games, error } = await supabase
    .from("games")
    .select("*")
    .eq("group_id", groupId)
    .lte("min_players", confirmedPlayerCount)
    .gte("max_players", confirmedPlayerCount)
    .lte("duration_minutes", availableMinutes);
  if (error) throw new Error(error.message);

  // Sortiere danach, wie gut die Spieldauer die verfügbare Zeit ausnutzt
  return (games ?? []).sort(
    (a, b) =>
      Math.abs(availableMinutes - a.duration_minutes) -
      Math.abs(availableMinutes - b.duration_minutes)
  );
}

// ---------------------------------------------------------------------
// Discord-Webhook-Benachrichtigung
// ---------------------------------------------------------------------

async function maybeNotifyDiscord(
  groupId: string,
  event: "event_confirmed" | "perfect_match",
  payload: Record<string, unknown>
) {
  const supabase = await createServerSupabaseClient();
  const { data: integration } = await supabase
    .from("group_integrations")
    .select("*")
    .eq("group_id", groupId)
    .maybeSingle();

  if (!integration?.discord_webhook_url) return;
  if (event === "event_confirmed" && !integration.notify_on_event_confirmed) return;
  if (event === "perfect_match" && !integration.notify_on_perfect_match) return;

  const content =
    event === "event_confirmed"
      ? `🎲 Neuer Spielabend fixiert am **${payload.event_date}** um **${payload.start_time}** Uhr!`
      : `✨ Perfekter Tag gefunden: **${payload.date}** – alle können, ${payload.duration} Min. Überschneidung!`;

  try {
    await fetch(integration.discord_webhook_url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
  } catch {
    // Webhook-Fehler dürfen den Hauptflow nicht blockieren
  }
}

// =====================================================================
// ADMIN: Benutzerverwaltung
// =====================================================================
// Alle Funktionen hier verlassen sich zusätzlich auf die RLS-Policies
// "profiles: admin update all" (nur is_current_user_admin() darf andere
// Profile ändern) - selbst wenn jemand versucht, diese Funktionen zu
// missbrauchen, blockt die Datenbank nicht-Admins serverseitig ab.

async function requireAdmin(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Nicht angemeldet.");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", auth.user.id)
    .single();

  if (profile?.role !== "admin") throw new Error("Nur Admins dürfen das.");
  return auth.user;
}

/** Admins UND Mods dürfen den Admin-Bereich sehen (nur Mutationen sind admin-only). */
async function requireStaff(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Nicht angemeldet.");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", auth.user.id)
    .single();

  if (profile?.role !== "admin" && profile?.role !== "mod") {
    throw new Error("Kein Zugriff.");
  }
  return auth.user;
}

export async function adminApproveUser(userId: string) {
  const supabase = await createServerSupabaseClient();
  const admin = await requireAdmin(supabase);

  const { error } = await supabase
    .from("profiles")
    .update({ is_approved: true, approved_at: new Date().toISOString(), approved_by: admin.id })
    .eq("id", userId);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/users");
}

export async function adminLockUser(userId: string) {
  const supabase = await createServerSupabaseClient();
  await requireAdmin(supabase);

  const { error } = await supabase
    .from("profiles")
    .update({ is_approved: false })
    .eq("id", userId);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/users");
}

export async function adminSetRole(userId: string, role: "user" | "mod" | "admin") {
  const supabase = await createServerSupabaseClient();
  await requireAdmin(supabase);

  const { error } = await supabase.from("profiles").update({ role }).eq("id", userId);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/users");
}

/**
 * Löscht einen Nutzer vollständig (Auth-Account + Profil via Cascade).
 * Braucht den Service-Role-Client, weil das normale anon/RLS-Setup das
 * Löschen von auth.users nicht erlaubt.
 */
export async function adminDeleteUser(userId: string) {
  const supabase = await createServerSupabaseClient();
  const admin = await requireAdmin(supabase);

  if (userId === admin.id) {
    throw new Error("Du kannst dich nicht selbst löschen.");
  }

  const { createAdminSupabaseClient } = await import("@/lib/supabase/admin");
  const adminClient = createAdminSupabaseClient();

  const { error } = await adminClient.auth.admin.deleteUser(userId);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/users");
}

export async function getAllUsersForAdmin() {
  const supabase = await createServerSupabaseClient();
  await requireStaff(supabase);

  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, display_name, role, is_approved, created_at, avatar_color, avatar_url")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  return data;
}

// =====================================================================
// EVENTS: Löschen (Admin/Mod oder Ersteller/Host, via RLS abgesichert)
// =====================================================================

export async function deleteEvent(eventId: string) {
  const supabase = await createServerSupabaseClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Nicht angemeldet.");

  const { error } = await supabase.from("events").delete().eq("id", eventId);
  // RLS blockt automatisch, falls der Nutzer weder Staff noch
  // Ersteller/Host ist - error.message ist in dem Fall generisch von
  // Postgres, daher hier eine sprechendere Meldung.
  if (error) {
    throw new Error(
      "Löschen nicht möglich (fehlende Berechtigung oder Datenbankfehler): " + error.message
    );
  }

  revalidatePath("/dashboard");
}

/** Alle anstehenden (nicht abgesagten) Events einer Gruppe, für das Dashboard. */
export async function getUpcomingEvents(groupId: string) {
  const supabase = await createServerSupabaseClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("events")
    .select(
      `id, event_date, start_time, end_time, status, match_score, host_id, host_capacity,
       games(title),
       event_participants(user_id, status)`
    )
    .eq("group_id", groupId)
    .neq("status", "cancelled")
    .gte("event_date", today)
    .order("event_date", { ascending: true });

  if (error) throw new Error(error.message);
  return data;
}
