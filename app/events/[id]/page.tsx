// =====================================================================
// /events/[id] · Server Component
// Zeigt ein fixiertes Event: Host, Spiel, Zusagen, Uhrzeit, Food-Planer.
// Löschen ist sichtbar, wenn der Nutzer Admin/Mod ODER Ersteller/Host ist
// (die eigentliche Durchsetzung passiert zusätzlich per RLS in der DB).
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
      `id, group_id, event_date, start_time, end_time, host_id, host_capacity,
       game_id, status, match_score, created_by,
       event_participants(user_id, status, responded_at)`
    )
    .eq("id", id)
    .single();

  if (error || !event) notFound();

  const [{ data: memberRows }, { data: myProfile }] = await Promise.all([
    supabase
      .from("group_members")
      .select("profiles(id, display_name, avatar_color, avatar_url)")
      .eq("group_id", event.group_id),
    supabase.from("profiles").select("role").eq("id", auth.user.id).single(),
  ]);

  const members: Profile[] = (memberRows ?? []).map((row: any) => ({
    id: row.profiles.id,
    displayName: row.profiles.display_name,
    avatarColor: row.profiles.avatar_color,
    avatarUrl: row.profiles.avatar_url,
    role: "user",
    isApproved: true,
  }));

  const gameEvent: GameEvent = {
    id: event.id,
    groupId: event.group_id,
    title: "Spielabend",
    eventDate: event.event_date,
    startTime: event.start_time,
    endTime: event.end_time,
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
      date: event.event_date,
      startTime: event.start_time,
      endTime: event.end_time ?? event.start_time,
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
        groupId={event.group_id}
        dayMatch={dayMatch}
        members={members}
        existingEvent={gameEvent}
        currentUserId={auth.user.id}
        canDelete={isStaff || isCreatorOrHost}
      />
    </main>
  );
}
