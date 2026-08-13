"use client";

import { useRouter } from "next/navigation";
import { MatchScoreCalendar } from "@/components/calendar/MatchScoreCalendar";
import type { DayMatch } from "@/types";

interface DashboardCalendarClientProps {
  groupId: string;
  topDays: DayMatch[];
  monthMatches: DayMatch[];
}

/**
 * Thin Client Component boundary: die Datenladung passiert serverseitig
 * in page.tsx, nur die interaktive Navigation (onSelectDay) braucht
 * einen Client-Handler.
 */
export function DashboardCalendarClient({
  groupId,
  topDays,
  monthMatches,
}: DashboardCalendarClientProps) {
  const router = useRouter();

  return (
    <MatchScoreCalendar
      topDays={topDays}
      monthMatches={monthMatches}
      onSelectDay={(date) => router.push(`/events/new?groupId=${groupId}&date=${date}`)}
    />
  );
}
