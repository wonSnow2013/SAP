-- =====================================================================
-- SPIELEABEND-APP · DATENBANK-SCHEMA (Supabase / PostgreSQL)
-- =====================================================================
-- Aktivieren benötigter Extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- =====================================================================
-- 1. GRUPPEN & MITGLIEDSCHAFT
-- =====================================================================
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text unique not null default substr(md5(random()::text), 1, 8),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

-- Erweiterung des Supabase-Auth-Users um App-Profildaten
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  avatar_color text default '#6366f1', -- Hex-Farbe als einfacher Avatar
  address text,                        -- optional, für Host-Vorschläge
  latitude numeric,
  longitude numeric,
  created_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid references public.groups(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

-- =====================================================================
-- 2. VERFÜGBARKEITEN
-- =====================================================================

-- 2a. Wiederkehrende Wochen-Verfügbarkeit ("Jeden Dienstag ab 18 Uhr")
create table public.recurring_availability (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  group_id uuid references public.groups(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6), -- 0 = Sonntag
  start_time time not null,
  end_time time not null,
  preference smallint not null default 2 check (preference between 1 and 3),
  -- 1 = "wenn's sein muss", 2 = "gerne", 3 = "richtig Bock"
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);

-- 2b. Konkrete Datums-Verfügbarkeit (überschreibt/ergänzt die wiederkehrende)
create table public.date_availability (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  group_id uuid references public.groups(id) on delete cascade,
  date date not null,
  start_time time,
  end_time time,
  status text not null default 'available'
    check (status in ('available', 'blocked', 'maybe')),
  preference smallint check (preference between 1 and 3),
  note text,
  created_at timestamptz not null default now(),
  unique (user_id, group_id, date, start_time)
);

create index idx_date_availability_group_date
  on public.date_availability (group_id, date);
create index idx_recurring_availability_group_weekday
  on public.recurring_availability (group_id, weekday);

-- =====================================================================
-- 3. SPIELE-BIBLIOTHEK
-- =====================================================================
create table public.games (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references public.groups(id) on delete cascade,
  owner_id uuid references public.profiles(id) on delete set null,
  title text not null,
  bgg_id integer,                 -- optionale BoardGameGeek-Referenz
  thumbnail_url text,
  min_players smallint not null default 1,
  max_players smallint not null default 8,
  duration_minutes smallint not null default 60, -- geschätzte Spieldauer
  category text default 'Brettspiel'
    check (category in ('Brettspiel', 'Pen & Paper', 'LAN/Online', 'Sonstiges')),
  created_at timestamptz not null default now()
);

create index idx_games_group on public.games (group_id);

-- =====================================================================
-- 4. EVENTS (fixierte Spielabende)
-- =====================================================================
create table public.events (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references public.groups(id) on delete cascade,
  title text not null default 'Spielabend',
  event_date date not null,
  start_time time not null,
  end_time time,
  host_id uuid references public.profiles(id) on delete set null,
  host_capacity smallint,           -- z. B. "Max. 5 Leute auf der Couch"
  game_id uuid references public.games(id) on delete set null,
  status text not null default 'proposed'
    check (status in ('proposed', 'confirmed', 'cancelled')),
  match_score numeric,              -- Score zum Erstellungszeitpunkt (Nachvollziehbarkeit)
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index idx_events_group_date on public.events (group_id, event_date);

create table public.event_participants (
  event_id uuid references public.events(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  status text not null default 'invited'
    check (status in ('invited', 'accepted', 'declined', 'maybe')),
  responded_at timestamptz,
  primary key (event_id, user_id)
);

-- 4a. Food-/Snack-Planer je Event
create table public.event_food_items (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete cascade,
  item_name text not null,
  category text default 'Snack' check (category in ('Snack', 'Getränk', 'Hauptgericht', 'Sonstiges')),
  assigned_to uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- =====================================================================
-- 5. INTEGRATIONEN (Discord Webhook je Gruppe)
-- =====================================================================
create table public.group_integrations (
  group_id uuid primary key references public.groups(id) on delete cascade,
  discord_webhook_url text,
  notify_on_perfect_match boolean not null default true,
  notify_on_event_confirmed boolean not null default true
);

-- =====================================================================
-- 6. ROW LEVEL SECURITY
-- =====================================================================
alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.recurring_availability enable row level security;
alter table public.date_availability enable row level security;
alter table public.games enable row level security;
alter table public.events enable row level security;
alter table public.event_participants enable row level security;
alter table public.event_food_items enable row level security;
alter table public.group_integrations enable row level security;

-- Hilfsfunktion: Ist der aktuelle User Mitglied dieser Gruppe?
create or replace function public.is_group_member(_group_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.group_members
    where group_id = _group_id and user_id = auth.uid()
  );
$$;

-- Profile: jeder darf Profile von Gruppenmitgliedern sehen, nur eigenes bearbeiten
create policy "profiles: view group members"
  on public.profiles for select
  using (
    id = auth.uid()
    or exists (
      select 1 from public.group_members gm1
      join public.group_members gm2 on gm1.group_id = gm2.group_id
      where gm1.user_id = auth.uid() and gm2.user_id = profiles.id
    )
  );

create policy "profiles: update own"
  on public.profiles for update
  using (id = auth.uid());

create policy "profiles: insert own"
  on public.profiles for insert
  with check (id = auth.uid());

-- Gruppen: nur Mitglieder sehen ihre Gruppe
create policy "groups: select member"
  on public.groups for select
  using (public.is_group_member(id));

create policy "groups: insert authenticated"
  on public.groups for insert
  with check (auth.uid() is not null);

-- group_members: Mitglieder sehen die Mitgliederliste ihrer Gruppen
create policy "group_members: select same group"
  on public.group_members for select
  using (public.is_group_member(group_id));

create policy "group_members: insert self via invite"
  on public.group_members for insert
  with check (user_id = auth.uid());

-- Generisches Muster für alle gruppengebundenen Tabellen:
-- SELECT/INSERT/UPDATE/DELETE nur für Mitglieder der jeweiligen Gruppe.
create policy "recurring_availability: crud own within group"
  on public.recurring_availability for all
  using (public.is_group_member(group_id))
  with check (user_id = auth.uid() and public.is_group_member(group_id));

create policy "date_availability: crud own within group"
  on public.date_availability for all
  using (public.is_group_member(group_id))
  with check (user_id = auth.uid() and public.is_group_member(group_id));

create policy "games: select group"
  on public.games for select
  using (public.is_group_member(group_id));
create policy "games: modify own entries"
  on public.games for insert
  with check (public.is_group_member(group_id));
create policy "games: update own entries"
  on public.games for update
  using (public.is_group_member(group_id) and owner_id = auth.uid());
create policy "games: delete own entries"
  on public.games for delete
  using (public.is_group_member(group_id) and owner_id = auth.uid());

create policy "events: select group"
  on public.events for select
  using (public.is_group_member(group_id));
create policy "events: insert group"
  on public.events for insert
  with check (public.is_group_member(group_id));
create policy "events: update group"
  on public.events for update
  using (public.is_group_member(group_id));

create policy "event_participants: select via event group"
  on public.event_participants for select
  using (exists (
    select 1 from public.events e
    where e.id = event_participants.event_id
      and public.is_group_member(e.group_id)
  ));
create policy "event_participants: upsert own rsvp"
  on public.event_participants for all
  using (exists (
    select 1 from public.events e
    where e.id = event_participants.event_id
      and public.is_group_member(e.group_id)
  ))
  with check (user_id = auth.uid());

create policy "event_food_items: crud via event group"
  on public.event_food_items for all
  using (exists (
    select 1 from public.events e
    where e.id = event_food_items.event_id
      and public.is_group_member(e.group_id)
  ));

create policy "group_integrations: manage as member"
  on public.group_integrations for all
  using (public.is_group_member(group_id));

-- =====================================================================
-- 7. VIEW: normalisierte Tages-Slots (Basis für den Matching-Algorithmus)
-- =====================================================================
-- Kombiniert wiederkehrende + konkrete Verfügbarkeiten für einen Zeitraum.
-- Wird serverseitig (Server Action / Edge Function) aufgerufen, die Logik
-- selbst liegt aus Testbarkeitsgründen in TypeScript (siehe lib/matching-algorithm.ts).
create or replace view public.v_recurring_for_weekday as
select
  ra.group_id,
  ra.user_id,
  ra.weekday,
  ra.start_time,
  ra.end_time,
  ra.preference
from public.recurring_availability ra;
