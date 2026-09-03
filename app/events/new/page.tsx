// =====================================================================
// /events/new?date=... · Server Component
// Global - lädt ALLE freigegebenen Profile + das Match-Fenster für das
// gewählte Datum.
// =====================================================================

import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getBestDays } from "@/lib/actions";
import { EventPlanner } from "@/components/events/EventPlanner";
import { BackToDashboard } from "@/components/layout/BackToDashboard";
import type { Profile } from "@/types";

export default async function NewEventPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date } = await searchParams;
  if (!date) redirect("/dashboard");

  const supabase = await createServerSupabaseClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const [{ data: profileRows }, dayMatches] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, display_name, avatar_color, avatar_url")
      .eq("is_approved", true),
    getBestDays({ from: date, to: date }, 1),
  ]);

  const members: Profile[] = (profileRows ?? []).map((row: any) => ({
    id: row.id,
    displayName: row.display_name,
    avatarColor: row.avatar_color,
    avatarUrl: row.avatar_url,
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
      <EventPlanner dayMatch={dayMatch} members={members} currentUserId={auth.user.id} />
    </main>
  );
}
