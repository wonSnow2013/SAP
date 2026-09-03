-- =====================================================================
-- MIGRATION 003 · Gruppen-System entfernen, globaler Kalender,
-- zentrale Spielebibliothek, Über-Mitternacht-Verfügbarkeiten
-- =====================================================================
-- ACHTUNG: Dieses Skript löscht groups/group_members/group_integrations
-- inkl. aller Daten darin. Verfügbarkeiten, Events, Spiele, Profile
-- bleiben erhalten, verlieren aber ihre group_id-Spalte.
-- =====================================================================

-- 1. Alte, gruppen-abhängige RLS-Policies entfernen
drop policy if exists "recurring_availability: crud own within group" on public.recurring_availability;
drop policy if exists "date_availability: crud own within group" on public.date_availability;
drop policy if exists "games: select group" on public.games;
drop policy if exists "games: modify own entries" on public.games;
drop policy if exists "games: update own entries" on public.games;
drop policy if exists "games: delete own entries" on public.games;
drop policy if exists "events: select group" on public.events;
drop policy if exists "events: insert group" on public.events;
drop policy if exists "events: update group" on public.events;
drop policy if exists "events: update own or hosted" on public.events;
drop policy if exists "events: staff update any" on public.events;
drop policy if exists "events: own or hosted delete" on public.events;
drop policy if exists "events: staff delete" on public.events;
drop policy if exists "event_participants: select via event group" on public.event_participants;
drop policy if exists "event_participants: upsert own rsvp" on public.event_participants;
drop policy if exists "event_food_items: crud via event group" on public.event_food_items;
drop policy if exists "group_integrations: manage as member" on public.group_integrations;
drop policy if exists "groups: select member" on public.groups;
drop policy if exists "groups: select for join via invite code" on public.groups;
drop policy if exists "groups: insert authenticated" on public.groups;
drop policy if exists "group_members: select same group" on public.group_members;
drop policy if exists "group_members: insert self via invite" on public.group_members;

-- 2. group_id-Spalten entfernen
alter table public.recurring_availability drop column if exists group_id;
alter table public.date_availability drop column if exists group_id;
alter table public.games drop column if exists group_id;
alter table public.events drop column if exists group_id;

-- 3. Gruppen-Tabellen + alte Hilfsfunktion entfernen
drop table if exists public.group_integrations cascade;
drop table if exists public.group_members cascade;
drop table if exists public.groups cascade;
drop function if exists public.is_group_member(uuid);

-- 4. Neue Hilfsfunktion
create or replace function public.is_approved_user()
returns boolean
language sql security definer stable
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and is_approved = true
  );
$$;

-- 5. games-Tabelle: globale Bibliothek, umbenannte Felder
alter table public.games rename column duration_minutes to estimated_duration_minutes;
alter table public.games rename column thumbnail_url to image_url;
alter table public.games alter column min_players set default 1;
alter table public.games alter column max_players set default 8;

drop policy if exists "games: select all approved" on public.games;
create policy "games: select all approved"
  on public.games for select
  using (public.is_approved_user());

drop policy if exists "games: staff insert" on public.games;
create policy "games: staff insert"
  on public.games for insert
  with check (public.is_staff_user());

drop policy if exists "games: staff update" on public.games;
create policy "games: staff update"
  on public.games for update
  using (public.is_staff_user());

drop policy if exists "games: staff delete" on public.games;
create policy "games: staff delete"
  on public.games for delete
  using (public.is_staff_user());

-- 6. date_availability: von date+time auf echte timestamptz umstellen
alter table public.date_availability add column if not exists start_at timestamptz;
alter table public.date_availability add column if not exists end_at timestamptz;

update public.date_availability
set
  start_at = (date::text || ' ' || coalesce(start_time::text, '00:00'))::timestamptz,
  end_at = case
    when end_time is null then null
    when end_time > start_time then (date::text || ' ' || end_time::text)::timestamptz
    else ((date + interval '1 day')::date::text || ' ' || end_time::text)::timestamptz
  end
where start_at is null and start_time is not null;

update public.date_availability
set start_at = date::timestamptz
where start_at is null;

alter table public.date_availability drop column if exists start_time;
alter table public.date_availability drop column if exists end_time;
alter table public.date_availability drop constraint if exists date_availability_user_id_group_id_date_start_time_key;

create unique index if not exists date_availability_user_start_unique
  on public.date_availability (user_id, start_at);
create index if not exists idx_date_availability_start_at on public.date_availability (start_at);

drop policy if exists "date_availability: crud own" on public.date_availability;
create policy "date_availability: crud own"
  on public.date_availability for all
  using (public.is_approved_user())
  with check (user_id = auth.uid() and public.is_approved_user());

-- 7. recurring_availability: neue globale Policy
drop policy if exists "recurring_availability: crud own" on public.recurring_availability;
create policy "recurring_availability: crud own"
  on public.recurring_availability for all
  using (public.is_approved_user())
  with check (user_id = auth.uid() and public.is_approved_user());

-- 8. events: globale Policies + end_time_next_day
alter table public.events add column if not exists end_time_next_day boolean not null default false;

drop policy if exists "events: select all approved" on public.events;
create policy "events: select all approved"
  on public.events for select
  using (public.is_approved_user());

drop policy if exists "events: insert approved" on public.events;
create policy "events: insert approved"
  on public.events for insert
  with check (public.is_approved_user());

drop policy if exists "events: update own or hosted" on public.events;
create policy "events: update own or hosted"
  on public.events for update
  using (
    public.is_approved_user()
    and (created_by = auth.uid() or host_id = auth.uid())
  );

drop policy if exists "events: staff update any" on public.events;
create policy "events: staff update any"
  on public.events for update
  using (public.is_staff_user());

drop policy if exists "events: own or hosted delete" on public.events;
create policy "events: own or hosted delete"
  on public.events for delete
  using (
    public.is_approved_user()
    and (created_by = auth.uid() or host_id = auth.uid())
  );

drop policy if exists "events: staff delete" on public.events;
create policy "events: staff delete"
  on public.events for delete
  using (public.is_staff_user());

-- 9. event_participants / event_food_items: globale Policies
drop policy if exists "event_participants: select all approved" on public.event_participants;
create policy "event_participants: select all approved"
  on public.event_participants for select
  using (public.is_approved_user());

drop policy if exists "event_participants: upsert own rsvp" on public.event_participants;
create policy "event_participants: upsert own rsvp"
  on public.event_participants for all
  using (public.is_approved_user())
  with check (user_id = auth.uid());

drop policy if exists "event_food_items: crud all approved" on public.event_food_items;
create policy "event_food_items: crud all approved"
  on public.event_food_items for all
  using (public.is_approved_user());

-- 10. app_settings: ersetzt group_integrations
create table if not exists public.app_settings (
  id smallint primary key default 1 check (id = 1),
  discord_webhook_url text,
  notify_on_perfect_match boolean not null default true,
  notify_on_event_confirmed boolean not null default true
);
insert into public.app_settings (id) values (1) on conflict (id) do nothing;

alter table public.app_settings enable row level security;

drop policy if exists "app_settings: select approved" on public.app_settings;
create policy "app_settings: select approved"
  on public.app_settings for select
  using (public.is_approved_user());

drop policy if exists "app_settings: staff update" on public.app_settings;
create policy "app_settings: staff update"
  on public.app_settings for update
  using (public.is_staff_user());

-- =====================================================================
-- FERTIG. Kurzer Funktionscheck:
--   select * from public.app_settings;
--   select column_name from information_schema.columns where table_name = 'games' order by ordinal_position;
--   select column_name from information_schema.columns where table_name = 'date_availability' order by ordinal_position;
-- =====================================================================
