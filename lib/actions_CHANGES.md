# Änderungen an lib/actions.ts

Diese Datei NICHT komplett überschreiben - stattdessen die folgenden zwei
Änderungen an deiner bestehenden `lib/actions.ts` vornehmen.

## 1. `getUpcomingEvents()` ersetzen

Die bestehende Funktion `getUpcomingEvents()` komplett durch diese Version
ersetzen (jetzt auf die aktuelle Woche begrenzt statt alle zukünftigen
Events):

```ts
/**
 * Events der AKTUELLEN WOCHE (Montag-Sonntag, ab heute), nicht mehr alle
 * zukünftigen Events - für die "Diese Woche"-Liste im Dashboard.
 */
export async function getUpcomingEvents() {
  const supabase = await createServerSupabaseClient();
  const today = new Date().toISOString().slice(0, 10);
  const { to: weekEnd } = getCurrentWeekRange();

  const { data, error } = await supabase
    .from("events")
    .select(
      `id, event_date, start_time, end_time, end_time_next_day, status, match_score,
       host_id, host_capacity,
       games(title),
       event_participants(user_id, status)`
    )
    .neq("status", "cancelled")
    .gte("event_date", today)
    .lte("event_date", weekEnd)
    .order("event_date", { ascending: true });

  if (error) throw new Error(error.message);
  return data;
}

/** Montag-Sonntag der aktuellen Woche (Server läuft i. d. R. in UTC). */
function getCurrentWeekRange(): { from: string; to: string } {
  const now = new Date();
  const day = now.getUTCDay(); // 0 = Sonntag ... 6 = Samstag
  const diffToMonday = (day + 6) % 7;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - diffToMonday);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return {
    from: monday.toISOString().slice(0, 10),
    to: sunday.toISOString().slice(0, 10),
  };
}
```

## 2. Neue Funktion `getEventsInRange()` hinzufügen

Direkt UNTER der `getUpcomingEvents()`-Funktion einfügen (wird fürs
"bereits geplant"-Markieren im Kalender gebraucht - deckt den GANZEN
sichtbaren Monat ab, nicht nur die aktuelle Woche):

```ts
/**
 * Minimal-Infos zu allen (nicht abgesagten) Events in einem Datumsbereich -
 * für die Kalender-Markierung "an diesem Tag ist schon was geplant".
 */
export async function getEventsInRange(from: string, to: string) {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("events")
    .select("id, event_date")
    .neq("status", "cancelled")
    .gte("event_date", from)
    .lte("event_date", to);

  if (error) throw new Error(error.message);
  return data;
}
```

## Warum serverseitig UTC hier okay ist

Anders als der Kalender-Klick-Bug (der im BROWSER des Nutzers auftrat,
wo die lokale Zeitzone zählt) läuft `lib/actions.ts` serverseitig auf
Vercel, üblicherweise in UTC. Die Wochenberechnung hier ist in sich
konsistent (UTC-"heute" vs. UTC-Wochengrenzen) - es gibt keine Vermischung
von lokaler und UTC-Zeit wie beim Frontend-Bug, daher ist hier keine
Anpassung nötig.
