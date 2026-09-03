export type Preference = 1 | 2 | 3; // 1 = wenn's sein muss, 2 = gerne, 3 = richtig Bock

export type UserRole = "user" | "mod" | "admin";

export interface Profile {
  id: string;
  email?: string | null;
  displayName: string;
  avatarColor: string;
  avatarUrl?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  role: UserRole;
  isApproved: boolean;
}

/**
 * Ein einzelnes, normalisiertes Zeitfenster eines Users. startAt/endAt
 * sind volle ISO-Datetime-Strings (nicht nur "HH:mm") - dadurch lassen
 * sich Über-Mitternacht-Fenster (z. B. Fr 22:00 - Sa 02:00) direkt
 * abbilden, ohne pro Kalendertag zu bündeln.
 */
export interface TimeSlot {
  userId: string;
  startAt: string; // ISO datetime, z.B. "2026-08-18T18:00:00.000Z"
  endAt: string;
  preference: Preference;
  source: "recurring" | "date-specific";
}

/** Ergebnis: ein Überlapp-Fenster, ggf. über Mitternacht hinausgehend. */
export interface OverlapWindow {
  startAt: string;
  endAt: string;
  durationMinutes: number;
  participantIds: string[];
  averagePreference: number;
}

/** Aggregiertes Ergebnis pro Kalendertag (Tag, an dem das Fenster STARTET). */
export interface DayMatch {
  date: string; // ISO date (Starttag des besten Fensters)
  matchScore: number; // 0-100
  bestWindow: OverlapWindow | null;
  allWindows: OverlapWindow[];
  totalGroupSize: number;
  availableCount: number;
}

export interface Game {
  id: string;
  title: string;
  minPlayers: number;
  maxPlayers: number;
  estimatedDurationMinutes: number;
  imageUrl?: string | null;
  createdBy?: string | null;
}

export interface GameEvent {
  id: string;
  title: string;
  eventDate: string;
  startTime: string;
  endTime?: string | null;
  endTimeNextDay?: boolean;
  hostId?: string | null;
  hostCapacity?: number | null;
  gameId?: string | null;
  status: "proposed" | "confirmed" | "cancelled";
  matchScore?: number | null;
  participants: EventParticipant[];
}

export interface EventParticipant {
  eventId: string;
  userId: string;
  status: "invited" | "accepted" | "declined" | "maybe";
  respondedAt?: string | null;
}

export interface FoodItem {
  id: string;
  eventId: string;
  itemName: string;
  category: "Snack" | "Getränk" | "Hauptgericht" | "Sonstiges";
  assignedTo?: string | null;
}

/** Eintrag in "Meine Verfügbarkeiten" (vereinheitlichte Anzeige beider Arten). */
export interface MyAvailabilityEntry {
  id: string;
  kind: "recurring" | "date-specific";
  weekday?: number;
  startAt?: string;
  endAt?: string | null;
  status?: "available" | "blocked" | "maybe";
  note?: string | null;
  startTime: string; // "HH:mm", fürs Formular
  endTime: string;
  preference: Preference | null;
}
