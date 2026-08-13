// =====================================================================
// OVERLAP-ALGORITHMUS · Kernstück der Matchmaking-Engine
// =====================================================================
// Nimmt normalisierte TimeSlots (aus recurring_availability +
// date_availability zusammengeführt) und berechnet für jeden Tag im
// betrachteten Zeitraum einen Match-Score sowie das beste gemeinsame
// Zeitfenster.
//
// Design-Entscheidungen:
// - Zeiten werden in Minuten seit Mitternacht gerechnet (einfacher als
//   Date-Arithmetik, keine Zeitzonen-Fallstricke innerhalb eines Tages).
// - "Blocked"-Einträge (Urlaub/Sperrtage) entfernen den User komplett
//   aus der Betrachtung für diesen Tag, unabhängig von recurring-Slots.
// - Ein date-specific Eintrag überschreibt die recurring-Verfügbarkeit
//   für denselben User+Tag (konkrete Angaben sind genauer).
// - Der Score gewichtet sowohl die ANZAHL der Leute als auch die LÄNGE
//   der Überschneidung und die durchschnittliche Lust ("preference").
// =====================================================================

import type { DayMatch, OverlapWindow, Preference, TimeSlot } from "@/types";

const MIN_OVERLAP_MINUTES = 180; // mind. 3 zusammenhängende Stunden

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
    .toString()
    .padStart(2, "0");
  const m = (minutes % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

/**
 * Reduziert die Rohliste an Slots auf: pro User maximal EIN maßgeblicher
 * Slot je Tag (date-specific schlägt recurring), und entfernt Tage, an
 * denen der User sich als "blocked" markiert hat.
 */
function resolveEffectiveSlots(
  slots: TimeSlot[],
  blockedUserDates: Set<string> // Format: `${userId}__${date}`
): TimeSlot[] {
  const byUserDate = new Map<string, TimeSlot[]>();

  for (const slot of slots) {
    const key = `${slot.userId}__${slot.date}`;
    if (blockedUserDates.has(key)) continue; // Sperrtag -> raus
    if (!byUserDate.has(key)) byUserDate.set(key, []);
    byUserDate.get(key)!.push(slot);
  }

  const effective: TimeSlot[] = [];
  for (const [, daySlots] of byUserDate) {
    const dateSpecific = daySlots.filter((s) => s.source === "date-specific");
    // date-specific überschreibt recurring vollständig für diesen User+Tag
    effective.push(...(dateSpecific.length > 0 ? dateSpecific : daySlots));
  }
  return effective;
}

/**
 * Findet alle Fenster, in denen sich mindestens 2 Personen an einem Tag
 * überschneiden, mittels eines Sweep-Line-Ansatzes über die Minutenachse.
 */
function findOverlapWindows(daySlots: TimeSlot[]): OverlapWindow[] {
  if (daySlots.length === 0) return [];

  type Event = { minute: number; delta: number; userId: string; preference: Preference };
  const events: Event[] = [];

  for (const slot of daySlots) {
    events.push({
      minute: timeToMinutes(slot.startTime),
      delta: 1,
      userId: slot.userId,
      preference: slot.preference,
    });
    events.push({
      minute: timeToMinutes(slot.endTime),
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
        date: "", // wird vom Aufrufer gesetzt
        startTime: minutesToTime(segmentStart),
        endTime: minutesToTime(segmentEnd),
        durationMinutes: duration,
        participantIds: [...activeUsers.keys()],
        averagePreference: prefs.reduce((a, b) => a + b, 0) / prefs.length,
      });
    }
  };

  let i = 0;
  while (i < events.length) {
    const currentMinute = events[i].minute;
    // Segment vor dieser Minute abschließen, falls User aktiv waren
    flushSegment(currentMinute);

    // alle Events zur gleichen Minute anwenden
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
 * Berechnet den Match-Score (0–100) für einen Tag.
 * Gewichtung: 60% Personenanzahl (relativ zur Gruppengröße),
 *             30% Überschneidungsdauer (capped bei 5h),
 *             10% durchschnittliche Lust der Teilnehmer.
 */
function computeMatchScore(
  bestWindow: OverlapWindow | null,
  totalGroupSize: number
): number {
  if (!bestWindow || totalGroupSize === 0) return 0;

  const participantRatio = bestWindow.participantIds.length / totalGroupSize;
  const durationScore = Math.min(bestWindow.durationMinutes / 300, 1); // 5h = 100%
  const preferenceScore = (bestWindow.averagePreference - 1) / 2; // 1..3 -> 0..1

  const score =
    participantRatio * 60 + durationScore * 30 + preferenceScore * 10;

  return Math.round(score * 10) / 10;
}

export interface CalculateBestDaysOptions {
  slots: TimeSlot[];
  blockedUserDates: Set<string>;
  groupMemberIds: string[];
  dateRange: { from: string; to: string }; // ISO dates, inklusiv
  topN?: number;
}

/**
 * Haupteinstiegspunkt: berechnet für jeden Tag im Zeitraum den Match-Score
 * und liefert die Top-N Tage sortiert nach Score absteigend.
 */
export function calculateBestDays({
  slots,
  blockedUserDates,
  groupMemberIds,
  dateRange,
  topN = 3,
}: CalculateBestDaysOptions): DayMatch[] {
  const effectiveSlots = resolveEffectiveSlots(slots, blockedUserDates);

  const slotsByDate = new Map<string, TimeSlot[]>();
  for (const slot of effectiveSlots) {
    if (!slotsByDate.has(slot.date)) slotsByDate.set(slot.date, []);
    slotsByDate.get(slot.date)!.push(slot);
  }

  const allDates = enumerateDates(dateRange.from, dateRange.to);
  const results: DayMatch[] = [];

  for (const date of allDates) {
    const daySlots = slotsByDate.get(date) ?? [];
    const windows = findOverlapWindows(daySlots).map((w) => ({ ...w, date }));

    // bestes Fenster = höchste Kombination aus Teilnehmerzahl & Dauer
    const bestWindow =
      windows.length > 0
        ? windows.reduce((best, w) =>
            w.participantIds.length * w.durationMinutes >
            best.participantIds.length * best.durationMinutes
              ? w
              : best
          )
        : null;

    const availableCount = new Set(daySlots.map((s) => s.userId)).size;

    results.push({
      date,
      matchScore: computeMatchScore(bestWindow, groupMemberIds.length),
      bestWindow,
      allWindows: windows,
      totalGroupSize: groupMemberIds.length,
      availableCount,
    });
  }

  return results
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, topN);
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
 * Expandiert wiederkehrende Verfügbarkeiten in konkrete TimeSlots für
 * einen gegebenen Zeitraum, damit sie mit date-specific Slots gemeinsam
 * verarbeitet werden können.
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
  const dates = enumerateDates(dateRange.from, dateRange.to);
  const slots: TimeSlot[] = [];

  for (const dateStr of dates) {
    const weekday = new Date(dateStr + "T00:00:00Z").getUTCDay();
    for (const r of recurring) {
      if (r.weekday === weekday) {
        slots.push({
          userId: r.userId,
          date: dateStr,
          startTime: r.startTime,
          endTime: r.endTime,
          preference: r.preference,
          source: "recurring",
        });
      }
    }
  }
  return slots;
}
