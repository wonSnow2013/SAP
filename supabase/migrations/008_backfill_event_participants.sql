-- =====================================================================
-- MIGRATION 008 · Backfill fehlender event_participants-Zeilen
-- =====================================================================
-- URSACHE: createEvent() versuchte bisher, für ALLE freigegebenen Nutzer
-- in einem einzigen Mehrzeilen-INSERT eine event_participants-Zeile
-- anzulegen. Die RLS-Policy erlaubte aber nur das Einfügen der EIGENEN
-- Zeile (user_id = auth.uid()) - bei einem Mehrzeilen-INSERT verwirft
-- Postgres die GESAMTE Anfrage, sobald auch nur eine Zeile die Regel
-- verletzt. Ergebnis: für JEDES bisher erstellte Event wurden GAR KEINE
-- Teilnehmer-Zeilen angelegt (auch nicht die des Erstellers) - RSVP-
-- Klicks liefen dadurch ins Leere (Update auf eine nicht existierende
-- Zeile betrifft 0 Zeilen, ohne Fehler).
--
-- Dieses Skript legt die fehlenden Zeilen für alle bereits bestehenden
-- Events nachträglich an.
-- =====================================================================

insert into public.event_participants (event_id, user_id, status)
select
  e.id,
  p.id,
  case when p.id = e.created_by then 'accepted' else 'invited' end
from public.events e
cross join public.profiles p
where p.is_approved = true
  and not exists (
    select 1 from public.event_participants ep
    where ep.event_id = e.id and ep.user_id = p.id
  );

-- =====================================================================
-- Kurzer Check danach:
--   select e.id, e.event_date, count(ep.user_id) as teilnehmer_zeilen
--   from public.events e
--   left join public.event_participants ep on ep.event_id = e.id
--   group by e.id, e.event_date
--   order by e.event_date;
-- =====================================================================
