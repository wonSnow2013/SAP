"use client";

import { useRouter } from "next/navigation";
import { MatchScoreCalendar } from "@/components/calendar/MatchScoreCalendar";
import type { DayMatch } from "@/types";

interface DashboardCalendarClientProps {
  topDays: DayMatch[];
  monthMatches: DayMatch[];
  /** ISO-Datum -> Event-ID, für Tage mit bereits fixiertem Termin. */
  eventsByDate: Record<string, string>;
}

export function DashboardCalendarClient({
  topDays,
  monthMatches,
  eventsByDate,
}: DashboardCalendarClientProps) {
  const router = useRouter();

  return (
    <MatchScoreCalendar
      topDays={topDays}
      monthMatches={monthMatches}
      eventsByDate={eventsByDate}
      onSelectDay={(date, existingEventId) => {
        // Tag bereits verplant -> direkt zum bestehenden Event statt zur
        // "neues Event erstellen"-Seite.
        if (existingEventId) {
          router.push(`/events/${existingEventId}`);
        } else {
          router.push(`/events/new?date=${date}`);
        }
      }}
    />
  );
}
