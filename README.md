# 🎲 Spieleabend-App

Globale Kalender- & Matchmaking-App für eine feste Freundesgruppe (kein
Mehrgruppen-System mehr) – alle freigegebenen Nutzer teilen sich denselben
Kalender, dieselbe Spielebibliothek und dieselben Events.

## Migrations-Reihenfolge (auf einer bestehenden DB)

1. `supabase/migrations/002_admin_approval_system.sql` – Rollen (`user`/`mod`/`admin`)
   + Freigabe-Workflow (`is_approved`).
2. `supabase/migrations/003_global_calendar_no_groups.sql` – entfernt das
   Gruppen-System vollständig, macht die Spielebibliothek global, stellt
   `date_availability` auf echte `timestamptz`-Spalten um (Über-Mitternacht-
   Support).
3. `supabase/migrations/004_fix_missed_columns.sql` – **zwingend nötig**,
   behebt zwei Bugs aus Migration 003: `games` fehlte die Spalte
   `created_by` (Spiele anlegen schlug fehl), `date_availability` hatte
   noch eine verwaiste NOT-NULL-Spalte `date` (jede neue Verfügbarkeit
   schlug fehl, nicht nur Über-Mitternacht-Fenster).
4. `supabase/migrations/005_fix_recurring_overnight_constraint.sql` –
   **zwingend nötig**, entfernt eine Legacy-Constraint aus der
   allerersten Schema-Version (`end_time > start_time` auf
   `recurring_availability`), die Über-Mitternacht-Zeiten bei
   wiederkehrenden Verfügbarkeiten blockiert hat.
5. `supabase/migrations/006_fix_missing_profiles_select_policy.sql` –
   **kritisch, zwingend nötig**: Migration 003 hat beim Löschen von
   `group_members` (per `CASCADE`) versehentlich die Policy mitgelöscht,
   die normalen Nutzern erlaubte, ihre EIGENE Profilzeile zu lesen.
   Ohne diesen Fix sieht die App `is_approved` für nicht-Admin/Mod-Nutzer
   nie korrekt, egal was in der Datenbank steht - sie bleiben dauerhaft
   auf `/pending-approval` hängen.
6. `supabase/migrations/007_backfill_missing_profiles.sql` – legt für
   "Alt-Accounts" (registriert bevor der `handle_new_user()`-Trigger
   existierte) nachträglich eine `profiles`-Zeile an. Ohne Profil loggt
   Supabase solche Nutzer bei jedem Magic-Link einfach in ihren
   bestehenden Account ein (kein neuer Sign-up, Trigger feuert nie), sie
   bleiben ohne dieses Backfill dauerhaft ohne Profil hängen. Der
   Auth-Callback (`app/auth/callback/route.ts`) legt so ein fehlendes
   Profil zusätzlich automatisch an, falls es doch nochmal vorkommt.
7. `supabase/migrations/008_backfill_event_participants.sql` –
   **zwingend nötig**: `createEvent()` versuchte bisher, in einem
   einzigen Mehrzeilen-INSERT für ALLE freigegebenen Nutzer eine
   `event_participants`-Zeile anzulegen. Die RLS-Policy erlaubte aber
   nur das Einfügen der eigenen Zeile - bei einem Mehrzeilen-INSERT
   verwirft Postgres die GESAMTE Anfrage, sobald eine Zeile die Regel
   verletzt. Für JEDES bisher erstellte Event fehlten dadurch alle
   Teilnehmer-Zeilen, RSVP-Klicks liefen ins Leere. `lib/actions.ts`
   nutzt für diesen Insert jetzt den Service-Role-Client (umgeht RLS
   gezielt für diesen systemseitigen Schritt); dieses Backfill repariert
   bereits bestehende Events nachträglich.

**Neuinstallation:** einfach `supabase/schema.sql` ausführen (enthält
bereits den finalen Stand nach allen Migrationen).

## Was sich mit dem Gruppen-Refactor geändert hat

- **Kein `groups`/`group_members` mehr.** Jeder freigegebene Nutzer
  (`profiles.is_approved = true`) sieht automatisch alle Verfügbarkeiten,
  Events und Spiele – durchgesetzt über `is_approved_user()` in praktisch
  jeder RLS-Policy.
- **`games`** ist jetzt eine globale Bibliothek (`estimated_duration_minutes`,
  `image_url` statt der alten `duration_minutes`/`thumbnail_url`-Namen).
  Nur `role in ('admin','mod')` darf schreiben, siehe `/admin/games`.
- **`date_availability`** nutzt jetzt `start_at`/`end_at` als volle
  `timestamptz`-Werte statt `date` + `start_time`/`end_time`. Das ist die
  Grundlage für Über-Mitternacht-Fenster (z. B. Fr 22:00–Sa 02:00): die
  Endzeit liegt einfach auf dem nächsten Kalendertag, es gibt keinen
  Sonderfall mehr.
- **Matching-Algorithmus** (`lib/matching-algorithm.ts`) rechnet nicht mehr
  pro Kalendertag, sondern in einem einzigen Sweep über den gesamten
  Zeitraum mit absoluten Zeitstempeln. Ein Fenster wird danach dem Tag
  zugeordnet, an dem es *startet* (Fr 22 Uhr – Sa 2 Uhr zählt als
  "Freitagabend").
- **Events** haben ein neues Feld `end_time_next_day`, damit UI und
  iCal-Export wissen, ob die Endzeit auf den Folgetag fällt.
- **Kein `/onboarding` mehr.** Da es keine Gruppen zum Gründen/Beitreten
  mehr gibt, landen frisch freigegebene Nutzer direkt im globalen
  Dashboard.

## Setup

```bash
npm install
cp .env.example .env.local   # Supabase-Projekt-Keys eintragen
npm run dev
```

`SUPABASE_SERVICE_ROLE_KEY` wird für "Nutzer endgültig löschen" im
Admin-Panel gebraucht (niemals mit `NEXT_PUBLIC_`-Präfix!).

## "Meine Verfügbarkeiten" (`/profile` → Tab "Meine Verfügbarkeiten")

Zeigt alle eigenen Einträge chronologisch, mit Bearbeiten/Löschen. Konkrete
Termine und wiederkehrende Regeln werden getrennt gruppiert; ein
Mond-Icon markiert Einträge, die über Mitternacht gehen.

## Spielauswahl bei Event-Erstellung (`/events/new`)

Zwei Wege, ein Spiel zuzuweisen:
1. **Dropdown** mit der kompletten Bibliothek (zeigt Min/Max-Spieler +
   Dauer direkt in der Optionsliste).
2. **Automatische Vorschläge** darunter, gefiltert nach zugesagter
   Spielerzahl und verfügbarem Zeitfenster.

## Bekannte Vereinfachungen

- BoardGameGeek-Import ist weiterhin nicht angebunden (nur manuelle Eingabe
  über `/admin/games`).
- Realtime-RSVP-Updates (ohne Reload) sind nicht implementiert – ließe sich
  über `supabase.channel(...).on('postgres_changes', ...)` in `EventPlanner`
  nachrüsten.
