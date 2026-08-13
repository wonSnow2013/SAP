"use client";

// =====================================================================
// MatchScoreCalendar
// Zeigt die Top-3-Tage der Gruppe als hervorgehobene Karten + eine
// kompakte Monatsansicht, in der jeder Tag anhand seines Match-Scores
// eingefärbt ist. Klick auf einen Tag öffnet den Event-Planner.
// =====================================================================

import { useMemo, useState } from "react";
import { Sparkles, Users, Clock, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DayMatch } from "@/types";

interface MatchScoreCalendarProps {
  /** Match-Ergebnisse für ALLE Tage im sichtbaren Monat (nicht nur Top 3). */
  monthMatches: DayMatch[];
  topDays: DayMatch[];
  onSelectDay: (date: string) => void;
  initialMonth?: Date;
}

function scoreToColor(score: number): string {
  if (score >= 75) return "bg-emerald-500 text-white";
  if (score >= 50) return "bg-emerald-300 text-emerald-950";
  if (score >= 25) return "bg-amber-200 text-amber-900";
  if (score > 0) return "bg-slate-200 text-slate-600";
  return "bg-slate-50 text-slate-300";
}

export function MatchScoreCalendar({
  monthMatches,
  topDays,
  onSelectDay,
  initialMonth = new Date(),
}: MatchScoreCalendarProps) {
  const [month, setMonth] = useState(initialMonth);

  const matchByDate = useMemo(() => {
    const map = new Map<string, DayMatch>();
    for (const m of monthMatches) map.set(m.date, m);
    return map;
  }, [monthMatches]);

  const weeks = useMemo(() => buildCalendarWeeks(month), [month]);

  return (
    <div className="space-y-8">
      {/* Top-3 Highlight-Karten */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-slate-900">
          <Sparkles className="h-5 w-5 text-violet-500" />
          Top 3 optimale Spieltage
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {topDays.map((day, idx) => (
            <button
              key={day.date}
              onClick={() => onSelectDay(day.date)}
              className={cn(
                "group relative overflow-hidden rounded-2xl border p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-lg",
                idx === 0
                  ? "border-violet-300 bg-gradient-to-br from-violet-50 to-white"
                  : "border-slate-200 bg-white"
              )}
            >
              {idx === 0 && (
                <span className="absolute right-3 top-3 rounded-full bg-violet-600 px-2 py-0.5 text-xs font-medium text-white">
                  Bester Tag
                </span>
              )}
              <p className="text-sm font-medium text-slate-500">
                {formatWeekdayDate(day.date)}
              </p>
              <p className="mt-1 text-3xl font-bold text-slate-900">
                {day.matchScore.toFixed(0)}
                <span className="text-base font-normal text-slate-400">/100</span>
              </p>
              <div className="mt-3 flex items-center gap-4 text-sm text-slate-600">
                <span className="flex items-center gap-1">
                  <Users className="h-4 w-4" />
                  {day.bestWindow?.participantIds.length ?? 0}/{day.totalGroupSize}
                </span>
                {day.bestWindow && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    {day.bestWindow.startTime}–{day.bestWindow.endTime}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Monatsansicht */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">
            {month.toLocaleDateString("de-DE", { month: "long", year: "numeric" })}
          </h2>
          <div className="flex gap-1">
            <button
              aria-label="Vorheriger Monat"
              onClick={() => setMonth(shiftMonth(month, -1))}
              className="rounded-lg p-1.5 hover:bg-slate-100"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              aria-label="Nächster Monat"
              onClick={() => setMonth(shiftMonth(month, 1))}
              className="rounded-lg p-1.5 hover:bg-slate-100"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-slate-400">
          {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((d) => (
            <div key={d} className="pb-1">
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {weeks.flat().map((date, i) => {
            if (!date) return <div key={i} />;
            const iso = toISODate(date);
            const match = matchByDate.get(iso);
            const inCurrentMonth = date.getMonth() === month.getMonth();

            return (
              <button
                key={iso}
                onClick={() => onSelectDay(iso)}
                disabled={!inCurrentMonth}
                className={cn(
                  "aspect-square rounded-lg text-sm font-medium transition-transform hover:scale-105 disabled:opacity-30",
                  match ? scoreToColor(match.matchScore) : "bg-slate-50 text-slate-400"
                )}
                title={match ? `Match-Score: ${match.matchScore.toFixed(0)}` : undefined}
              >
                {date.getDate()}
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

// --- Datums-Helfer -----------------------------------------------------

function buildCalendarWeeks(month: Date): (Date | null)[][] {
  const year = month.getFullYear();
  const m = month.getMonth();
  const firstDay = new Date(year, m, 1);
  // Montag = 0 ... Sonntag = 6
  const startOffset = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, m + 1, 0).getDate();

  const cells: (Date | null)[] = Array(startOffset).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, m, d));
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

function shiftMonth(date: Date, delta: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatWeekdayDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("de-DE", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
  });
}
