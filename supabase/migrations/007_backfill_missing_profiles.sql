-- =====================================================================
-- MIGRATION 007 · Backfill fehlender profiles-Zeilen für Alt-Accounts
-- =====================================================================
-- Der handle_new_user()-Trigger (Migration 002) legt eine profiles-Zeile
-- nur bei einem NEUEN INSERT in auth.users an - also nur beim allerersten
-- Sign-up. Nutzer, die sich VOR Migration 002 registriert hatten, haben
-- einen auth.users-Eintrag ohne zugehöriges Profil. Bei jedem weiteren
-- Magic-Link-Login loggt Supabase sie in den bestehenden Account ein
-- (kein neuer Sign-up, Trigger feuert nicht erneut) - die App findet nie
-- ein Profil und hält sie fälschlich für nicht freigegeben.
--
-- Dieses Skript legt für ALLE betroffenen Alt-Accounts nachträglich eine
-- profiles-Zeile an (Status: nicht freigegeben, muss regulär über
-- /admin/users freigeschaltet werden).
-- =====================================================================

insert into public.profiles (id, email, display_name, role, is_approved)
select
  u.id,
  u.email,
  coalesce(nullif(split_part(u.email, '@', 1), ''), 'Nutzer'),
  'user',
  false
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;

-- =====================================================================
-- Kurzer Check danach - sollte 0 Zeilen liefern:
--   select u.id, u.email
--   from auth.users u
--   left join public.profiles p on p.id = u.id
--   where p.id is null;
-- =====================================================================
