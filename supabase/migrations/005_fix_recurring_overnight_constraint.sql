-- =====================================================================
-- MIGRATION 005 · Legacy-Constraint entfernen, die Über-Mitternacht-
-- Zeiten bei wiederkehrenden Verfügbarkeiten blockiert
-- =====================================================================
-- Aus der allerersten Schema-Version stammt die Constraint
-- "check (end_time > start_time)" auf recurring_availability. Die
-- verbietet genau das, was Über-Mitternacht-Fenster ausmacht (z. B.
-- Freitag 22:00 - 02:00: 02:00 ist als reine Uhrzeit "kleiner" als
-- 22:00). Keine der bisherigen Migrationen hat diese Constraint
-- entfernt - hier wird das nachgeholt.
-- =====================================================================

alter table public.recurring_availability
  drop constraint if exists recurring_availability_check;

-- Zur Sicherheit: falls der Name in eurer Instanz abweicht (z. B.
-- recurring_availability_check1), einmal die tatsächlichen Constraint-
-- Namen prüfen und ggf. manuell droppen:
--   select conname from pg_constraint
--   where conrelid = 'public.recurring_availability'::regclass;

-- =====================================================================
-- Kurzer Check danach - sollte nur noch die weekday- und preference-
-- Checks zeigen, keine end_time > start_time Constraint mehr:
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--   where conrelid = 'public.recurring_availability'::regclass;
-- =====================================================================
