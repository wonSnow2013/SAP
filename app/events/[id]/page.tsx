// =====================================================================
// /events/[id] · Server Component
// Zeigt ein fixiertes Event. Löschen sichtbar für Admin/Mod ODER
// Ersteller/Host (RLS erzwingt das zusätzlich auf DB-Ebene).
// =====================================================================

import { notFound, redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { EventPlanner } from "@/components/events/EventPlanner";
import { BackToDashboard } from "@/components/layout/BackToDashboard";
import type { DayMatch, GameEvent, Profile } from "@/types";

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const { data: event, error } = await supabase
    .from("events")
    .select(
      `id, event_date, start_time, end_time, end_time_next_day, host_id, host_capacity,
       game_id, status, match_score, created_by,
       event_participants(user_id, status, responded_at)`
    )
    .eq("id", id)
    .single();

  if (error || !event) notFound();

  const [{ data: profileRows }, { data: myProfile }] = await Promise.all([
    supabase.from("profiles").select("id, display_name, avatar_color, avatar_url").eq("is_approved", true),
    supabase.from("profiles").select("role").eq("id", auth.user.id).single(),
  ]);

  const members: Profile[] = (profileRows ?? []).map((row: any) => ({
    id: row.id,
    displayName: row.display_name,
    avatarColor: row.avatar_color,
    avatarUrl: row.avatar_url,
    role: "user",
    isApproved: true,
  }));

  const gameEvent: GameEvent = {
    id: event.id,
    title: "Spielabend",
    eventDate: event.event_date,
    startTime: event.start_time,
    endTime: event.end_time,
    endTimeNextDay: event.end_time_next_day,
    hostId: event.host_id,
    hostCapacity: event.host_capacity,
    gameId: event.game_id,
    status: event.status,
    matchScore: event.match_score,
    participants: (event.event_participants ?? []).map((p: any) => ({
      eventId: event.id,
      userId: p.user_id,
      status: p.status,
      respondedAt: p.responded_at,
    })),
  };

  const dayMatch: DayMatch = {
    date: event.event_date,
    matchScore: event.match_score ?? 0,
    bestWindow: {
      startAt: `${event.event_date}T${event.start_time}`,
      endAt: `${event.end_time_next_day ? addDays(event.event_date, 1) : event.event_date}T${
        event.end_time ?? event.start_time
      }`,
      durationMinutes: 0,
      participantIds: gameEvent.participants
        .filter((p) => p.status === "accepted")
        .map((p) => p.userId),
      averagePreference: 2,
    },
    allWindows: [],
    totalGroupSize: members.length,
    availableCount: members.length,
  };

  const isStaff = myProfile?.role === "admin" || myProfile?.role === "mod";
  const isCreatorOrHost = event.created_by === auth.user.id || event.host_id === auth.user.id;

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <BackToDashboard />
      <EventPlanner
        dayMatch={dayMatch}
        members={members}
        existingEvent={gameEvent}
        currentUserId={auth.user.id}
        canDelete={isStaff || isCreatorOrHost}
      />
    </main>
  );
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
