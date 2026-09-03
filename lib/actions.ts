"use server";

// =====================================================================
// SERVER ACTIONS · Next.js App Router
// Global (kein groupId mehr) - RLS gated überall auf profiles.is_approved
// (siehe is_approved_user() in der DB) bzw. is_staff_user() für Admin/Mod.
// =====================================================================

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { calculateBestDays, expandRecurringToSlots } from "@/lib/matching-algorithm";
import type { DayMatch, Preference, TimeSlot, MyAvailabilityEntry } from "@/types";

// ---------------------------------------------------------------------
// Verfügbarkeiten: eintragen
// ---------------------------------------------------------------------

export async function upsertRecurringAvailability(input: {
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
    weekday: input.weekday,
    start_time: input.startTime,
    end_time: input.endTime,
    preference: input.preference,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard");
  revalidatePath("/profile");
}

/**
 * Legt eine konkrete Datums-Verfügbarkeit an. Unterstützt Fenster über
 * Mitternacht: Wenn endDate nicht explizit angegeben ist, wird
 * automatisch der Folgetag angenommen, sobald endTime <= startTime ist.
 */
export async function upsertDateAvailability(input: {
  date: string;
  startTime?: string;
  endTime?: string;
  endDate?: string;
  status: "available" | "blocked" | "maybe";
  preference?: Preference;
  note?: string;
}) {
  const supabase = await createServerSupabaseClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Nicht angemeldet.");

  const startAt =
    input.status === "available" && input.startTime
      ? `${input.date}T${input.startTime}:00`
      : `${input.date}T00:00:00`;

  let endAt: string | null = null;
  if (input.status === "available" && input.startTime && input.endTime) {
    const spansNextDay = !input.endDate && input.endTime <= input.startTime;
    const endDate = input.endDate ?? (spansNextDay ? addDays(input.date, 1) : input.date);
    endAt = `${endDate}T${input.endTime}:00`;
  }

  const { error } = await supabase.from("date_availability").upsert(
    {
      user_id: auth.user.id,
      start_at: startAt,
      end_at: endAt,
      status: input.status,
      preference: input.status === "available" ? input.preference ?? null : null,
      note: input.note ?? null,
    },
    { onConflict: "user_id,start_at" }
  );
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard");
  revalidatePath("/profile");
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------
// Verfügbarkeiten: "Meine Verfügbarkeiten" - Übersicht, Bearbeiten, Löschen
// ---------------------------------------------------------------------

export async function getMyAvailabilities(): Promise<MyAvailabilityEntry[]> {
  const supabase = await createServerSupabaseClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Nicht angemeldet.");

  const today = new Date().toISOString().slice(0, 10);

  const [{ data: recurring }, { data: dateSpecific }] = await Promise.all([
    supabase
      .from("recurring_availability")
      .select("id, weekday, start_time, end_time, preference")
      .eq("user_id", auth.user.id)
      .order("weekday", { ascending: true }),
    supabase
      .from("date_availability")
      .select("id, start_at, end_at, status, preference, note")
      .eq("user_id", auth.user.id)
      .gte("start_at", `${today}T00:00:00`)
      .order("start_at", { ascending: true }),
  ]);

  const recurringEntries: MyAvailabilityEntry[] = (recurring ?? []).map((r) => ({
    id: r.id,
    kind: "recurring",
    weekday: r.weekday,
    startTime: r.start_time.slice(0, 5),
    endTime: r.end_time.slice(0, 5),
    preference: r.preference,
  }));

  const dateEntries: MyAvailabilityEntry[] = (dateSpecific ?? []).map((d) => ({
    id: d.id,
    kind: "date-specific",
    startAt: d.start_at,
    endAt: d.end_at,
    status: d.status,
    note: d.note,
    startTime: new Date(d.start_at).toISOString().slice(11, 16),
    endTime: d.end_at ? new Date(d.end_at).toISOString().slice(11, 16) : "",
    preference: d.preference,
  }));

  return [...dateEntries, ...recurringEntries];
}

export async function deleteRecurringAvailability(id: string) {
  const supabase = await createServerSupabaseClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Nicht angemeldet.");

  const { error } = await supabase
    .from("recurring_availability")
    .delete()
    .eq("id", id)
    .eq("user_id", auth.user.id);
  if (error) throw new Error(error.message);

  revalidatePath("/profile");
  revalidatePath("/dashboard");
}

export async function deleteDateAvailability(id: string) {
  const supabase = await createServerSupabaseClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Nicht angemeldet.");

  const { error } = await supabase
    .from("date_availability")
    .delete()
    .eq("id", id)
    .eq("user_id", auth.user.id);
  if (error) throw new Error(error.message);

  revalidatePath("/profile");
  revalidatePath("/dashboard");
}

export async function updateDateAvailability(
  id: string,
  input: {
    date: string;
    startTime?: string;
    endTime?: string;
    endDate?: string;
    status: "available" | "blocked" | "maybe";
    preference?: Preference;
    note?: string;
  }
) {
  const supabase = await createServerSupabaseClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Nicht angemeldet.");

  const startAt =
    input.status === "available" && input.startTime
      ? `${input.date}T${input.startTime}:00`
      : `${input.date}T00:00:00`;

  let endAt: string | null = null;
  if (input.status === "available" && input.startTime && input.endTime) {
    const spansNextDay = !input.endDate && input.endTime <= input.startTime;
    const endDate = input.endDate ?? (spansNextDay ? addDays(input.date, 1) : input.date);
    endAt = `${endDate}T${input.endTime}:00`;
  }

  const { error } = await supabase
    .from("date_availability")
    .update({
      start_at: startAt,
      end_at: endAt,
      status: input.status,
      preference: input.status === "available" ? input.preference ?? null : null,
      note: input.note ?? null,
    })
    .eq("id", id)
    .eq("user_id", auth.user.id);
  if (error) throw new Error(error.message);

  revalidatePath("/profile");
  revalidatePath("/dashboard");
}

// ---------------------------------------------------------------------
// Matching: beste Tage für den Zeitraum berechnen (global, alle Nutzer)
// ---------------------------------------------------------------------

export async function getBestDays(
  dateRange: { from: string; to: string },
  topN = 3
): Promise<DayMatch[]> {
  const supabase = await createServerSupabaseClient();

  const [{ data: users }, { data: recurring }, { data: dateSpecific }] = await Promise.all([
    supabase.from("profiles").select("id").eq("is_approved", true),
    supabase
      .from("recurring_availability")
      .select("user_id, weekday, start_time, end_time, preference"),
    supabase
      .from("date_availability")
      .select("user_id, start_at, end_at, status, preference")
      .gte("start_at", `${addDays(dateRange.from, -1)}T00:00:00`)
      .lte("start_at", `${dateRange.to}T23:59:59`),
  ]);

  const totalUserCount = (users ?? []).length;

  const recurringSlots = expandRecurringToSlots(
    (recurring ?? []).map((r) => ({
      userId: r.user_id,
      weekday: r.weekday,
      startTime: r.start_time.slice(0, 5),
      endTime: r.end_time.slice(0, 5),
      preference: r.preference as Preference,
    })),
    dateRange
  );

  const blockedRanges: { userId: string; startAt: string; endAt: string }[] = [];
  const dateSlots: TimeSlot[] = [];

  for (const d of dateSpecific ?? []) {
    if (d.status === "blocked") {
      const dayEnd = addDays(d.start_at.slice(0, 10), 1) + "T00:00:00";
      blockedRanges.push({
        userId: d.user_id,
        startAt: d.start_at,
        endAt: d.end_at ?? dayEnd,
      });
      continue;
    }
    if (d.end_at) {
      dateSlots.push({
        userId: d.user_id,
        startAt: d.start_at,
        endAt: d.end_at,
        preference: (d.preference ?? 2) as Preference,
        source: "date-specific",
      });
    }
  }

  return calculateBestDays({
    slots: [...recurringSlots, ...dateSlots],
    blockedRanges,
    totalUserCount,
    dateRange,
    topN,
  });
}

// ---------------------------------------------------------------------
// Event erstellen / RSVP
// ---------------------------------------------------------------------

export async function createEvent(input: {
  eventDate: string;
  startTime: string;
  endTime?: string;
  endTimeNextDay?: boolean;
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
      event_date: input.eventDate,
      start_time: input.startTime,
      end_time: input.endTime,
      end_time_next_day: input.endTimeNextDay ?? false,
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

  const { data: users } = await supabase.from("profiles").select("id").eq("is_approved", true);

  if (users?.length) {
    await supabase.from("event_participants").insert(
      users.map((u) => ({
        event_id: event.id,
        user_id: u.id,
        status: u.id === auth.user!.id ? "accepted" : "invited",
      }))
    );
  }

  await maybeNotifyDiscord("event_confirmed", event);
  revalidatePath("/dashboard");
  return event;
}

export async function respondToEvent(eventId: string, status: "accepted" | "declined" | "maybe") {
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

export async function deleteEvent(eventId: string) {
  const supabase = await createServerSupabaseClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Nicht angemeldet.");

  const { error } = await supabase.from("events").delete().eq("id", eventId);
  if (error) {
    throw new Error(
      "Löschen nicht möglich (fehlende Berechtigung oder Datenbankfehler): " + error.message
    );
  }

  revalidatePath("/dashboard");
}

/** Alle anstehenden (nicht abgesagten) Events, global für die ganze App. */
export async function getUpcomingEvents() {
  const supabase = await createServerSupabaseClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("events")
    .select(
      `id, event_date, start_time, end_time, end_time_next_day, status, match_score,
       host_id, host_capacity,
       games(title),
       event_participants(user_id, status)`
    )
    .neq("status", "cancelled")
    .gte("event_date", today)
    .order("event_date", { ascending: true });

  if (error) throw new Error(error.message);
  return data;
}

// ---------------------------------------------------------------------
// Spiele-Bibliothek (global, lesen für alle, schreiben nur Admin/Mod)
// ---------------------------------------------------------------------

export async function getAllGames() {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("games")
    .select("*")
    .order("title", { ascending: true });
  if (error) throw new Error(error.message);
  return data;
}

/** Spielvorschlag basierend auf zugesagter Teilnehmerzahl & Zeitfenster. */
export async function suggestGamesForEvent(confirmedPlayerCount: number, availableMinutes: number) {
  const supabase = await createServerSupabaseClient();
  const { data: games, error } = await supabase
    .from("games")
    .select("*")
    .lte("min_players", confirmedPlayerCount)
    .gte("max_players", confirmedPlayerCount)
    .lte("estimated_duration_minutes", availableMinutes);
  if (error) throw new Error(error.message);

  return (games ?? []).sort(
    (a, b) =>
      Math.abs(availableMinutes - a.estimated_duration_minutes) -
      Math.abs(availableMinutes - b.estimated_duration_minutes)
  );
}

async function requireStaffForGames(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>
) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Nicht angemeldet.");
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", auth.user.id)
    .single();
  if (profile?.role !== "admin" && profile?.role !== "mod") {
    throw new Error("Nur Admins/Mods dürfen die Spielebibliothek verwalten.");
  }
  return auth.user;
}

export async function createGame(input: {
  title: string;
  minPlayers: number;
  maxPlayers: number;
  estimatedDurationMinutes: number;
  imageUrl?: string;
}) {
  const supabase = await createServerSupabaseClient();
  const user = await requireStaffForGames(supabase);

  const { error } = await supabase.from("games").insert({
    title: input.title,
    min_players: input.minPlayers,
    max_players: input.maxPlayers,
    estimated_duration_minutes: input.estimatedDurationMinutes,
    image_url: input.imageUrl ?? null,
    created_by: user.id,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/admin/games");
  revalidatePath("/events/new");
}

export async function updateGame(
  id: string,
  input: {
    title: string;
    minPlayers: number;
    maxPlayers: number;
    estimatedDurationMinutes: number;
    imageUrl?: string;
  }
) {
  const supabase = await createServerSupabaseClient();
  await requireStaffForGames(supabase);

  const { error } = await supabase
    .from("games")
    .update({
      title: input.title,
      min_players: input.minPlayers,
      max_players: input.maxPlayers,
      estimated_duration_minutes: input.estimatedDurationMinutes,
      image_url: input.imageUrl ?? null,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/games");
  revalidatePath("/events/new");
}

export async function deleteGame(id: string) {
  const supabase = await createServerSupabaseClient();
  await requireStaffForGames(supabase);

  const { error } = await supabase.from("games").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/games");
  revalidatePath("/events/new");
}

// ---------------------------------------------------------------------
// Discord-Webhook-Benachrichtigung (app-weit statt pro Gruppe)
// ---------------------------------------------------------------------

async function maybeNotifyDiscord(
  event: "event_confirmed" | "perfect_match",
  payload: Record<string, unknown>
) {
  const supabase = await createServerSupabaseClient();
  const { data: settings } = await supabase
    .from("app_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  if (!settings?.discord_webhook_url) return;
  if (event === "event_confirmed" && !settings.notify_on_event_confirmed) return;
  if (event === "perfect_match" && !settings.notify_on_perfect_match) return;

  const content =
    event === "event_confirmed"
      ? `🎲 Neuer Spielabend fixiert am **${payload.event_date}** um **${payload.start_time}** Uhr!`
      : `✨ Perfekter Tag gefunden: **${payload.date}** – alle können, ${payload.duration} Min. Überschneidung!`;

  try {
    await fetch(settings.discord_webhook_url, {
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

  const { error } = await supabase.from("profiles").update({ is_approved: false }).eq("id", userId);
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
