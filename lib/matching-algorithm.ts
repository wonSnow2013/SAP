// =====================================================================
// OVERLAP-ALGORITHMUS · Kernstück der Matchmaking-Engine
// =====================================================================
// Es wird NICHT mehr pro Kalendertag gerechnet, sondern in einem
// einzigen Sweep über den gesamten Zeitraum mit absoluten Zeitstempeln.
// Das ist der Grund, warum Über-Mitternacht-Fenster (z. B. Fr 22:00 -
// Sa 02:00) jetzt korrekt erkannt werden: es gibt keine künstliche
// Tagesgrenze mehr, an der ein Fenster "abgeschnitten" werden könnte.
//
// Jedes gefundene Überlapp-Fenster wird danach dem Kalendertag zugeordnet,
// an dem es STARTET (Fr 22 Uhr bis Sa 2 Uhr ist "Freitagabend").
// =====================================================================

import type { DayMatch, OverlapWindow, Preference, TimeSlot } from "@/types";

const MIN_OVERLAP_MINUTES = 180; // mind. 3 zusammenhängende Stunden
const MINUTES_PER_DAY = 24 * 60;

function isoToMinutes(iso: string, referenceMs: number): number {
  return Math.round((new Date(iso).getTime() - referenceMs) / 60000);
}

function minutesToIso(minutes: number, referenceMs: number): string {
  return new Date(referenceMs + minutes * 60000).toISOString();
}

/**
 * Reduziert die Rohliste an Slots auf: pro User maximal EIN maßgeblicher
 * Slot je Kalendertag (date-specific schlägt recurring für den Starttag),
 * und entfernt Zeiträume, die der User als "blocked" markiert hat.
 */
function resolveEffectiveSlots(
  slots: TimeSlot[],
  blockedRanges: { userId: string; startAt: string; endAt: string }[]
): TimeSlot[] {
  const byUserDay = new Map<string, TimeSlot[]>();
  for (const slot of slots) {
    const dayKey = slot.startAt.slice(0, 10);
    const key = `${slot.userId}__${dayKey}`;
    if (!byUserDay.has(key)) byUserDay.set(key, []);
    byUserDay.get(key)!.push(slot);
  }

  let effective: TimeSlot[] = [];
  for (const [, daySlots] of byUserDay) {
    const dateSpecific = daySlots.filter((s) => s.source === "date-specific");
    effective.push(...(dateSpecific.length > 0 ? dateSpecific : daySlots));
  }

  if (blockedRanges.length > 0) {
    effective = effective.filter((slot) => {
      const slotStart = new Date(slot.startAt).getTime();
      const slotEnd = new Date(slot.endAt).getTime();
      return !blockedRanges.some(
        (b) =>
          b.userId === slot.userId &&
          slotStart < new Date(b.endAt).getTime() &&
          slotEnd > new Date(b.startAt).getTime()
      );
    });
  }

  return effective;
}

/**
 * Sweep-Line über ALLE Slots im gesamten Zeitraum gleichzeitig (nicht pro
 * Tag). Liefert alle Fenster mit >= 2 Personen und >= 3h Dauer, jeweils
 * als absolute Zeitstempel (können über Mitternacht hinausgehen).
 */
function findOverlapWindows(slots: TimeSlot[], referenceMs: number): OverlapWindow[] {
  if (slots.length === 0) return [];

  type Event = { minute: number; delta: number; userId: string; preference: Preference };
  const events: Event[] = [];

  for (const slot of slots) {
    events.push({
      minute: isoToMinutes(slot.startAt, referenceMs),
      delta: 1,
      userId: slot.userId,
      preference: slot.preference,
    });
    events.push({
      minute: isoToMinutes(slot.endAt, referenceMs),
      delta: -1,
      userId: slot.userId,
      preference: slot.preference,
    });
  }
  events.sort((a, b) => a.minute - b.minute);

  const windows: OverlapWindow[] = [];
  const activeUsers = new Map<string, Preference>();
  let segmentStart: number | null = null;

  const flushSegment = (segmentEnd: number) => {
    if (segmentStart === null) return;
    const duration = segmentEnd - segmentStart;
    if (activeUsers.size >= 2 && duration >= MIN_OVERLAP_MINUTES) {
      const prefs = [...activeUsers.values()];
      windows.push({
        startAt: minutesToIso(segmentStart, referenceMs),
        endAt: minutesToIso(segmentEnd, referenceMs),
        durationMinutes: duration,
        participantIds: [...activeUsers.keys()],
        averagePreference: prefs.reduce((a, b) => a + b, 0) / prefs.length,
      });
    }
  };

  let i = 0;
  while (i < events.length) {
    const currentMinute = events[i].minute;
    flushSegment(currentMinute);

    while (i < events.length && events[i].minute === currentMinute) {
      const ev = events[i];
      if (ev.delta === 1) activeUsers.set(ev.userId, ev.preference);
      else activeUsers.delete(ev.userId);
      i++;
    }
    segmentStart = currentMinute;
  }

  return windows;
}

/**
 * Match-Score (0–100) für ein Fenster.
 * Gewichtung: 60% Personenanzahl (relativ zur Gruppengröße),
 *             30% Überschneidungsdauer (capped bei 5h),
 *             10% durchschnittliche Lust der Teilnehmer.
 */
function computeMatchScore(window: OverlapWindow | null, totalGroupSize: number): number {
  if (!window || totalGroupSize === 0) return 0;

  const participantRatio = window.participantIds.length / totalGroupSize;
  const durationScore = Math.min(window.durationMinutes / 300, 1);
  const preferenceScore = (window.averagePreference - 1) / 2;

  const score = participantRatio * 60 + durationScore * 30 + preferenceScore * 10;
  return Math.round(score * 10) / 10;
}

export interface CalculateBestDaysOptions {
  slots: TimeSlot[];
  blockedRanges: { userId: string; startAt: string; endAt: string }[];
  totalUserCount: number;
  dateRange: { from: string; to: string };
  topN?: number;
}

/**
 * Haupteinstiegspunkt: ein globaler Sweep über den gesamten Zeitraum,
 * danach werden die gefundenen Fenster nach ihrem STARTTAG gruppiert und
 * pro Tag der Match-Score berechnet.
 */
export function calculateBestDays({
  slots,
  blockedRanges,
  totalUserCount,
  dateRange,
  topN = 3,
}: CalculateBestDaysOptions): DayMatch[] {
  const effectiveSlots = resolveEffectiveSlots(slots, blockedRanges);

  const referenceMs =
    new Date(dateRange.from + "T00:00:00Z").getTime() - MINUTES_PER_DAY * 60000;

  const allWindows = findOverlapWindows(effectiveSlots, referenceMs);

  const windowsByDay = new Map<string, OverlapWindow[]>();
  for (const w of allWindows) {
    const day = w.startAt.slice(0, 10);
    if (!windowsByDay.has(day)) windowsByDay.set(day, []);
    windowsByDay.get(day)!.push(w);
  }

  const allDates = enumerateDates(dateRange.from, dateRange.to);
  const results: DayMatch[] = [];

  for (const date of allDates) {
    const dayWindows = windowsByDay.get(date) ?? [];

    const bestWindow =
      dayWindows.length > 0
        ? dayWindows.reduce((best, w) =>
            w.participantIds.length * w.durationMinutes >
            best.participantIds.length * best.durationMinutes
              ? w
              : best
          )
        : null;

    const availableCount = new Set(
      effectiveSlots.filter((s) => s.startAt.slice(0, 10) === date).map((s) => s.userId)
    ).size;

    results.push({
      date,
      matchScore: computeMatchScore(bestWindow, totalUserCount),
      bestWindow,
      allWindows: dayWindows,
      totalGroupSize: totalUserCount,
      availableCount,
    });
  }

  return results.sort((a, b) => b.matchScore - a.matchScore).slice(0, topN);
}

function enumerateDates(from: string, to: string): string[] {
  const dates: string[] = [];
  const current = new Date(from + "T00:00:00Z");
  const end = new Date(to + "T00:00:00Z");
  while (current <= end) {
    dates.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

/**
 * Expandiert wiederkehrende Verfügbarkeiten (Uhrzeit ohne Datum) in
 * konkrete TimeSlots mit absoluten Timestamps für den Zeitraum.
 * end_time <= start_time wird als "geht bis in den nächsten Tag"
 * interpretiert.
 */
export function expandRecurringToSlots(
  recurring: Array<{
    userId: string;
    weekday: number;
    startTime: string;
    endTime: string;
    preference: Preference;
  }>,
  dateRange: { from: string; to: string }
): TimeSlot[] {
  const rangeStart = new Date(dateRange.from + "T00:00:00Z");
  const expansionStart = new Date(rangeStart);
  expansionStart.setUTCDate(expansionStart.getUTCDate() - 1);
  const dates = enumerateDates(expansionStart.toISOString().slice(0, 10), dateRange.to);

  const slots: TimeSlot[] = [];

  for (const dateStr of dates) {
    const weekday = new Date(dateStr + "T00:00:00Z").getUTCDay();
    for (const r of recurring) {
      if (r.weekday !== weekday) continue;

      const startAt = `${dateStr}T${r.startTime}:00.000Z`;
      const spansNextDay = r.endTime <= r.startTime;
      const endDateStr = spansNextDay ? addDays(dateStr, 1) : dateStr;
      const endAt = `${endDateStr}T${r.endTime}:00.000Z`;

      slots.push({
        userId: r.userId,
        startAt,
        endAt,
        preference: r.preference,
        source: "recurring",
      });
    }
  }
  return slots;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
