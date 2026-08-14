// =====================================================================
// /events/new?groupId=...&date=... · Server Component
// Lädt Gruppenmitglieder + das Match-Fenster für das gewählte Datum und
// rendert den EventPlanner (Client Component) zur Fixierung des Abends.
// =====================================================================

import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getBestDaysForGroup } from "@/lib/actions";
import { EventPlanner } from "@/components/events/EventPlanner";
import { BackToDashboard } from "@/components/layout/BackToDashboard";
import type { Profile } from "@/types";

export default async function NewEventPage({
  searchParams,
}: {
  searchParams: Promise<{ groupId?: string; date?: string }>;
}) {
  const { groupId, date } = await searchParams;
  if (!groupId || !date) redirect("/dashboard");

  const supabase = await createServerSupabaseClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const [{ data: memberRows }, dayMatches] = await Promise.all([
    supabase
      .from("group_members")
      .select("profiles(id, display_name, avatar_color, avatar_url)")
      .eq("group_id", groupId),
    getBestDaysForGroup(groupId, { from: date, to: date }, 1),
  ]);

  const members: Profile[] = (memberRows ?? []).map((row: any) => ({
    id: row.profiles.id,
    displayName: row.profiles.display_name,
    avatarColor: row.profiles.avatar_color,
    avatarUrl: row.profiles.avatar_url,
    role: "user",
    isApproved: true,
  }));

  const dayMatch = dayMatches[0] ?? {
    date,
    matchScore: 0,
    bestWindow: null,
    allWindows: [],
    totalGroupSize: members.length,
    availableCount: 0,
  };

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <BackToDashboard />
      <EventPlanner
        groupId={groupId}
        dayMatch={dayMatch}
        members={members}
        currentUserId={auth.user.id}
      />
    </main>
  );
}
