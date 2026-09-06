-- =====================================================================
-- MIGRATION 006 · Kritischer Fix: fehlende SELECT-Policy auf "profiles"
-- =====================================================================
-- URSACHE: Migration 003 hat "group_members" per
-- "drop table ... cascade" gelöscht. Die ursprüngliche Policy
-- "profiles: view group members" (aus dem allerersten Schema) enthielt
-- in ihrer USING-Klausel einen Verweis auf group_members - und wurde
-- dadurch automatisch MIT gelöscht (Postgres behandelt Policies, die
-- eine Tabelle referenzieren, als von ihr abhängige Objekte).
--
-- Diese Policy war die EINZIGE, die normalen Nutzern erlaubte, ihre
-- EIGENE Profilzeile zu lesen (id = auth.uid()). Seitdem sehen normale
-- (nicht-Admin/Mod) Nutzer ihr eigenes Profil gar nicht mehr -> die App
-- hält sie fälschlich für nicht gefunden/nicht freigegeben, unabhängig
-- vom tatsächlichen is_approved-Wert in der Datenbank.
-- =====================================================================

drop policy if exists "profiles: view own or shared" on public.profiles;
create policy "profiles: view own or shared"
  on public.profiles for select
  using (id = auth.uid() or public.is_approved_user());

-- =====================================================================
-- Kurzer Check danach - sollte JETZT die eigene Zeile finden:
--   select conname, pg_get_expr(pol.polqual, pol.polrelid) as using_clause
--   from pg_policy pol
--   join pg_class c on c.oid = pol.polrelid
--   where c.relname = 'profiles';
-- =====================================================================
