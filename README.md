# 🎲 Spieleabend-App — Technischer Bauplan

Kalender- & Matchmaking-App für feste Freundesgruppen (4–10 Personen), um ohne
Chat-Chaos den optimalen Termin für Brettspiel-/Pen&Paper-/Gaming-Abende zu finden.

## 1. Tech-Stack

| Layer | Wahl | Begründung |
|---|---|---|
| Frontend | Next.js 15 (App Router), React 19, Tailwind CSS, Lucide Icons | Server Components für schnelles initiales Laden, Server Actions statt separatem REST-Layer |
| Backend / DB | Supabase (PostgreSQL, Auth, Row Level Security, Realtime) | Auth + DB + Realtime aus einer Hand, RLS macht Gruppen-Isolation wasserdicht auf DB-Ebene |
| Deployment | Vercel (Frontend) + Supabase Cloud | Zero-Config-Deploy, generous free tier für 4–10 Nutzer |

**Warum Supabase statt Prisma+eigene DB?** Für eine Freundesgruppen-App ist die
eingebaute Auth (Magic Link), Realtime (Live-RSVP-Updates) und RLS (jede Gruppe
sieht nur ihre eigenen Daten, erzwungen auf DB-Ebene statt nur im Code) der
entscheidende Vorteil. Der Code ist so strukturiert, dass die Datenzugriffs-
schicht (`lib/actions.ts`) austauschbar bleibt, falls später auf Prisma
gewechselt werden soll.

## 2. Projektstruktur

```
spieleabend-app/
├── supabase/
│   └── schema.sql              # Vollständiges DDL + RLS-Policies (Schritt 1)
├── types/
│   └── index.ts                # Geteilte TypeScript-Typen
├── lib/
│   ├── matching-algorithm.ts   # Overlap-Algorithmus, reine Funktion (Schritt 2)
│   ├── actions.ts              # Server Actions: Data-Layer + Discord-Webhook
│   ├── utils.ts                # cn()-Helper für Tailwind
│   └── supabase/
│       ├── server.ts           # Supabase-Client für Server Components/Actions
│       └── client.ts           # Supabase-Client für Client Components
├── components/
│   ├── availability/
│   │   └── AvailabilityForm.tsx    # Zeiteingabe (wiederkehrend + Datum)
│   ├── calendar/
│   │   └── MatchScoreCalendar.tsx  # Top-3-Karten + Monatsansicht
│   └── events/
│       ├── EventPlanner.tsx        # Host, Spielauswahl, RSVP
│       └── FoodPlanner.tsx         # Snack-/Getränke-Checkliste
└── app/
    ├── dashboard/
    │   ├── page.tsx                 # Server Component: lädt Matches
    │   └── DashboardCalendarClient.tsx
    ├── events/new/page.tsx          # Event-Erstellung an einem Top-Tag
    └── api/
        └── events/[id]/ical/route.ts  # iCal-Export
```

## 3. UI/UX-Seitenstruktur

### 3.1 Dashboard (`/dashboard`) — Startseite nach Login
```
┌─────────────────────────────────────────────────────────┐
│ [Gruppenname]                    [+ Verfügbarkeit eintragen] │
├─────────────────────────────────────────────────────────┤
│ ✨ Top 3 optimale Spieltage                               │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐                    │
│ │ Bester Tag│ │  Tag 2   │ │  Tag 3   │  <- Match-Score,   │
│ │ Score 92  │ │ Score 78 │ │ Score 65 │     Teilnehmer,    │
│ │ 6/6 · 4h  │ │ 5/6 · 3h │ │ 4/6 · 3h │     Zeitfenster    │
│ └──────────┘ └──────────┘ └──────────┘                    │
├─────────────────────────────────────────────────────────┤
│ August 2026                              [<]  [>]         │
│  Mo Di Mi Do Fr Sa So                                      │
│  ░░ ░░ ▓▓ ██ ░░ ▓▓ ░░   <- Farbcodierung nach Match-Score  │
│  ...                                                        │
└─────────────────────────────────────────────────────────┘
```
Klick auf einen Top-Tag ODER einen grün eingefärbten Kalendertag → `/events/new`.

### 3.2 Verfügbarkeit eintragen (`/availability`)
Zwei-Tab-Formular: „Konkretes Datum" (Standard) und „Wöchentlich". Direkt
darunter eine Liste der eigenen bereits eingetragenen Regeln/Termine mit
Lösch-Möglichkeit.

### 3.3 Event-Planer (`/events/new` bzw. `/events/[id]`)
```
┌─────────────────────────────────────────────┐
│ Spielabend am Dienstag, 18.08.        [Match 92] │
│ 🕐 18:00–22:00   👥 6/6 zugesagt              │
├─────────────────────────────────────────────┤
│ Wer hostet?  [Anna ✓] [Ben] [Chris] ...       │
│ Max. Kapazität: [6] Personen                  │
├─────────────────────────────────────────────┤
│ 🎲 Passende Spiele (6 Spieler, ~4h)           │
│ [Catan]  [Codenames]  [Root]  [Wingspan]      │
├─────────────────────────────────────────────┤
│ Zusagen: Anna ✓  Ben ✓  Chris ?  ...          │
│ [Zusagen] [Vielleicht] [Absagen]              │
├─────────────────────────────────────────────┤
│ 🍕 Snacks & Getränke                          │
│ Chips — Anna bringt mit                       │
│ Cola  — offen        [Ich bringe es mit]      │
└─────────────────────────────────────────────┘
```

### 3.4 Spiele-Bibliothek (`/games`)
Grid aus Spielkarten (Titel, Min/Max-Spieler, Dauer, Kategorie), mit
Formular zum Hinzufügen eigener Spiele. Optionale BGG-ID für spätere
BoardGameGeek-Thumbnail-Anreicherung.

## 4. Der Overlap-Algorithmus — Kernidee

Datei: `lib/matching-algorithm.ts`

1. **Normalisierung**: `recurring_availability` (z. B. „jeden Dienstag ab 18
   Uhr") wird für den betrachteten Zeitraum in konkrete `TimeSlot`-Objekte
   expandiert (`expandRecurringToSlots`). Konkrete Datums-Einträge
   überschreiben wiederkehrende für denselben Tag; Sperrtage entfernen den
   User komplett aus der Betrachtung.
2. **Sweep-Line pro Tag** (`findOverlapWindows`): Start-/Endzeiten aller
   Nutzer werden als +1/-1-Events auf einer Zeitachse sortiert. Beim
   Durchlaufen wird die Menge der gerade „aktiven" Nutzer mitgeführt — jedes
   Segment mit ≥ 2 aktiven Personen und ≥ 180 Minuten Dauer wird als
   `OverlapWindow` gespeichert. Laufzeit: O(n log n) pro Tag statt O(n²)
   durch paarweisen Vergleich.
3. **Scoring** (`computeMatchScore`): 60 % Teilnehmerquote (relativ zur
   Gruppengröße), 30 % Überschneidungsdauer (gedeckelt bei 5h), 10 %
   durchschnittliche Lust der Beteiligten → Score 0–100.
4. **Top-N-Auswahl**: Alle Tage im Zeitraum werden absteigend nach Score
   sortiert; Dashboard zeigt die Top 3, die Kalenderansicht alle Tage
   farbcodiert.

Die Funktion ist bewusst als **reine Funktion ohne DB-Zugriff** implementiert
(Input: Slot-Arrays, Output: `DayMatch[]`) — dadurch einfach unit-testbar
und wiederverwendbar (z. B. später als Supabase Edge Function für einen
täglichen Cron-Job, der bei einem „perfekten Tag" automatisch den
Discord-Webhook auslöst, siehe `maybeNotifyDiscord` in `lib/actions.ts`).

## 5. Sicherheitsmodell (RLS)

Jede gruppengebundene Tabelle hat eine Policy, die auf die Hilfsfunktion
`is_group_member(group_id)` prüft — ein Nutzer sieht ausschließlich Daten
von Gruppen, in denen er via `group_members` eingetragen ist. Schreibrechte
sind zusätzlich auf den eigenen `user_id` beschränkt (z. B. kann niemand die
Verfügbarkeit eines anderen Mitglieds verändern). Das greift unabhängig
davon, ob der Zugriff über die App, die Supabase-REST-API oder direkt per
SQL erfolgt.

## 6. Setup

```bash
npm install
cp .env.example .env.local   # Supabase-Projekt-Keys eintragen
# In der Supabase SQL-Konsole:  supabase/schema.sql ausführen
npm run dev
```

Für den Discord-Webhook: pro Gruppe in `group_integrations.discord_webhook_url`
die Webhook-URL aus den Kanal-Einstellungen eintragen (Discord: Kanal →
Integrationen → Webhooks → Neuer Webhook).

## 7. Bewusste Vereinfachungen / nächste Schritte

- **Auth-Flow** (Magic Link + Einladungslink mit PIN über `groups.invite_code`)
  ist im Schema vorbereitet, aber die Login-/Onboarding-Seiten sind aus
  Platzgründen nicht vollständig ausimplementiert — Supabase Auth UI oder ein
  eigenes Formular mit `supabase.auth.signInWithOtp()` docken direkt an.
- **BoardGameGeek-Integration**: `games.bgg_id` ist vorgesehen; ein
  serverseitiger Fetch gegen `https://boardgamegeek.com/xmlapi2/thing` beim
  Anlegen eines Spiels würde Thumbnail + Metadaten automatisch befüllen.
- **Realtime-RSVP**: Für „in Echtzeit" sollte `EventPlanner` zusätzlich
  `supabase.channel(...).on('postgres_changes', ...)` auf
  `event_participants` abonnieren, damit Zusagen ohne Reload erscheinen.
