// =====================================================================
// /dashboard · Server Component
// Globaler Kalender - lädt Match-Ergebnisse für ALLE freigegebenen
// Nutzer (kein Gruppen-Lookup mehr nötig).
// =====================================================================

import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getBestDays, getUpcomingEvents } from "@/lib/actions";
import { DashboardCalendarClient } from "./DashboardCalendarClient";
import { UpcomingEventsList } from "@/components/events/UpcomingEventsList";

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const today = new Date();
  const rangeStart = today.toISOString().slice(0, 10);
  const rangeEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    .toISOString()
    .slice(0, 10);

  const daysInRange =
    (new Date(rangeEnd).getTime() - new Date(rangeStart).getTime()) / 86_400_000 + 1;

  const [topDays, monthMatches, upcomingEvents] = await Promise.all([
    getBestDays({ from: rangeStart, to: rangeEnd }, 3),
    getBestDays({ from: rangeStart, to: rangeEnd }, daysInRange),
    getUpcomingEvents(),
  ]);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Spieleabend-Kalender</h1>
          <p className="text-sm text-slate-500">
            Findet gemeinsam den perfekten Spielabend.
          </p>
        </div>
        <Link
          href="/availability"
          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700"
        >
          Verfügbarkeit eintragen
        </Link>
      </header>

      <div className="space-y-10">
        <UpcomingEventsList events={upcomingEvents as any} />

        <DashboardCalendarClient topDays={topDays} monthMatches={monthMatches} />
      </div>
    </main>
  );
}
