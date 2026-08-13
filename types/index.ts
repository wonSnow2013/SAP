// =====================================================================
// SHARED TYPES
// =====================================================================

export type Preference = 1 | 2 | 3; // 1 = wenn's sein muss, 2 = gerne, 3 = richtig Bock

export interface Profile {
  id: string;
  displayName: string;
  avatarColor: string;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

/** Ein einzelnes, normalisiertes Zeitfenster eines Users an einem Tag. */
export interface TimeSlot {
  userId: string;
  date: string; // ISO date, z.B. "2026-08-18"
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm"
  preference: Preference;
  source: "recurring" | "date-specific";
}

/** Ergebnis: für einen Tag wurde ein Überlapp-Fenster gefunden. */
export interface OverlapWindow {
  date: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  participantIds: string[];
  averagePreference: number;
}

/** Aggregiertes Ergebnis pro Tag inkl. Match-Score. */
export interface DayMatch {
  date: string;
  matchScore: number; // 0-100
  bestWindow: OverlapWindow | null;
  allWindows: OverlapWindow[];
  totalGroupSize: number;
  availableCount: number;
}

export interface Game {
  id: string;
  groupId: string;
  ownerId: string | null;
  title: string;
  bggId?: number | null;
  thumbnailUrl?: string | null;
  minPlayers: number;
  maxPlayers: number;
  durationMinutes: number;
  category: "Brettspiel" | "Pen & Paper" | "LAN/Online" | "Sonstiges";
}

export interface GameEvent {
  id: string;
  groupId: string;
  title: string;
  eventDate: string;
  startTime: string;
  endTime?: string | null;
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
