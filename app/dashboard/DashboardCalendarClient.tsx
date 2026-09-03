"use client";

import { useRouter } from "next/navigation";
import { MatchScoreCalendar } from "@/components/calendar/MatchScoreCalendar";
import type { DayMatch } from "@/types";

interface DashboardCalendarClientProps {
  topDays: DayMatch[];
  monthMatches: DayMatch[];
}

export function DashboardCalendarClient({ topDays, monthMatches }: DashboardCalendarClientProps) {
  const router = useRouter();

  return (
    <MatchScoreCalendar
      topDays={topDays}
      monthMatches={monthMatches}
      onSelectDay={(date) => router.push(`/events/new?date=${date}`)}
    />
  );
}
