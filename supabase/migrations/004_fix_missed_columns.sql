-- =====================================================================
-- MIGRATION 004 · Korrigiert zwei Fehler aus Migration 003
-- =====================================================================
-- 1) games: fehlte die Spalte "created_by" (Code erwartet sie, die
--    Tabelle hatte nur die alte "owner_id"-Spalte).
-- 2) date_availability: die alte NOT-NULL-Spalte "date" wurde beim
--    Umbau auf start_at/end_at nie gedroppt - dadurch schlägt jeder
--    neue Insert mit "null value in column date violates not-null
--    constraint" fehl (Next.js zeigt das im Production-Build nur als
--    generische Fehlermeldung an).
-- =====================================================================

-- 1) games.created_by ergänzen (+ Altdaten aus owner_id übernehmen, falls vorhanden)
alter table public.games add column if not exists created_by uuid references public.profiles(id) on delete set null;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'games' and column_name = 'owner_id'
  ) then
    update public.games set created_by = owner_id where created_by is null;
  end if;
end $$;

-- Alte Spalte kann jetzt weg (wird vom Code nicht mehr verwendet)
alter table public.games drop column if exists owner_id;

-- 2) date_availability: verwaiste NOT-NULL-Spalte "date" entfernen
alter table public.date_availability drop column if exists date;

-- =====================================================================
-- Kurzer Check danach:
--   select column_name, is_nullable from information_schema.columns
--   where table_name = 'date_availability' order by ordinal_position;
--
--   select column_name from information_schema.columns
--   where table_name = 'games' order by ordinal_position;
-- =====================================================================
