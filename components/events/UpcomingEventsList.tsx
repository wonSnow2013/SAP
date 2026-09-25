import Link from "next/link";
import { CalendarDays, Users, Clock, Moon } from "lucide-react";

interface UpcomingEventRow {
  id: string;
  event_date: string;
  start_time: string;
  end_time: string | null;
  end_time_next_day: boolean;
  status: string;
  match_score: number | null;
  games: { title: string } | { title: string }[] | null;
  event_participants: { user_id: string; status: string }[];
}

/**
 * Zeigt bereits fixierte Spielabende. `title` ist konfigurierbar, damit
 * dieselbe Komponente sowohl für "Diese Woche" (Dashboard) als auch für
 * eine ungefilterte Liste (falls später gebraucht) genutzt werden kann.
 */
export function UpcomingEventsList({
  events,
  title = "Anstehende Spielabende",
}: {
  events: UpcomingEventRow[];
  title?: string;
}) {
  if (events.length === 0) {
    return (
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-slate-900">
          <CalendarDays className="h-5 w-5 text-violet-500" />
          {title}
        </h2>
        <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-400">
          Diese Woche ist noch nichts fixiert – wähl unten einen Top-Tag aus, um einen
          Spielabend zu planen.
        </p>
      </section>
    );
  }

  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-slate-900">
        <CalendarDays className="h-5 w-5 text-violet-500" />
        {title}
      </h2>
      <div className="space-y-2">
        {events.map((event) => {
          const game = Array.isArray(event.games) ? event.games[0] : event.games;
          const acceptedCount = event.event_participants.filter(
            (p) => p.status === "accepted"
          ).length;

          return (
            <Link
              key={event.id}
              href={`/events/${event.id}`}
              className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 transition-colors hover:border-violet-300 hover:bg-violet-50/40"
            >
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {new Date(event.event_date + "T00:00:00").toLocaleDateString("de-DE", {
                    weekday: "long",
                    day: "2-digit",
                    month: "long",
                  })}
                  {game && <span className="ml-2 font-normal text-slate-500">· {game.title}</span>}
                </p>
                <p className="mt-0.5 flex items-center gap-3 text-xs text-slate-500">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {event.start_time}
                    {event.end_time && `–${event.end_time}`}
                    {event.end_time_next_day && (
                      <span className="ml-1 inline-flex items-center gap-0.5 text-violet-600">
                        <Moon className="h-3 w-3" />
                        +1 Tag
                      </span>
                    )}
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" />
                    {acceptedCount} zugesagt
                  </span>
                </p>
              </div>
              <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                {event.status === "confirmed" ? "Fixiert" : "Vorgeschlagen"}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
