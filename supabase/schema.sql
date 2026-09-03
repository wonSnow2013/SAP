-- =====================================================================
-- SPIELEABEND-APP · DATENBANK-SCHEMA (Supabase / PostgreSQL)
-- Globale App für eine feste Freundesgruppe (kein Mehrgruppen-System) -
-- alle freigegebenen Nutzer (profiles.is_approved = true) teilen sich
-- denselben Kalender, dieselbe Spielebibliothek, dieselben Events.
--
-- Für eine bereits laufende DB NICHT dieses Skript ausführen -
-- stattdessen die migrations/ nacheinander (001 falls vorhanden, 002, 003).
-- =====================================================================
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- =====================================================================
-- 1. PROFILE (inkl. globalem Rollen- & Freigabe-System)
-- =====================================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text not null,
  avatar_color text default '#6366f1',
  avatar_url text,
  address text,
  latitude numeric,
  longitude numeric,
  role text not null default 'user' check (role in ('user', 'mod', 'admin')),
  is_approved boolean not null default false,
  approved_at timestamptz,
  approved_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- =====================================================================
-- 2. VERFÜGBARKEITEN (global, kein group_id)
-- =====================================================================
create table public.recurring_availability (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  preference smallint not null default 2 check (preference between 1 and 3),
  created_at timestamptz not null default now()
);

create table public.date_availability (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz,
  status text not null default 'available' check (status in ('available', 'blocked', 'maybe')),
  preference smallint check (preference between 1 and 3),
  note text,
  created_at timestamptz not null default now(),
  check (end_at is null or end_at > start_at)
);

create unique index date_availability_user_start_unique on public.date_availability (user_id, start_at);
create index idx_date_availability_start_at on public.date_availability (start_at);
create index idx_recurring_availability_weekday on public.recurring_availability (weekday);

-- =====================================================================
-- 3. SPIELE-BIBLIOTHEK (global, nur Admin/Mod dürfen schreiben)
-- =====================================================================
create table public.games (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  min_players smallint not null default 1,
  max_players smallint not null default 8,
  estimated_duration_minutes smallint not null default 60,
  image_url text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (max_players >= min_players)
);

-- =====================================================================
-- 4. EVENTS (fixierte Spielabende, global)
-- =====================================================================
create table public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Spielabend',
  event_date date not null,
  start_time time not null,
  end_time time,
  end_time_next_day boolean not null default false,
  host_id uuid references public.profiles(id) on delete set null,
  host_capacity smallint,
  game_id uuid references public.games(id) on delete set null,
  status text not null default 'proposed' check (status in ('proposed', 'confirmed', 'cancelled')),
  match_score numeric,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index idx_events_date on public.events (event_date);

create table public.event_participants (
  event_id uuid references public.events(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  status text not null default 'invited' check (status in ('invited', 'accepted', 'declined', 'maybe')),
  responded_at timestamptz,
  primary key (event_id, user_id)
);

create table public.event_food_items (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete cascade,
  item_name text not null,
  category text default 'Snack' check (category in ('Snack', 'Getränk', 'Hauptgericht', 'Sonstiges')),
  assigned_to uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- =====================================================================
-- 5. APP-WEITE EINSTELLUNGEN
-- =====================================================================
create table public.app_settings (
  id smallint primary key default 1 check (id = 1),
  discord_webhook_url text,
  notify_on_perfect_match boolean not null default true,
  notify_on_event_confirmed boolean not null default true
);
insert into public.app_settings (id) values (1);

-- =====================================================================
-- 6. ROW LEVEL SECURITY
-- =====================================================================
alter table public.profiles enable row level security;
alter table public.recurring_availability enable row level security;
alter table public.date_availability enable row level security;
alter table public.games enable row level security;
alter table public.events enable row level security;
alter table public.event_participants enable row level security;
alter table public.event_food_items enable row level security;
alter table public.app_settings enable row level security;

create or replace function public.is_approved_user()
returns boolean
language sql security definer stable
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and is_approved = true);
$$;

create or replace function public.is_current_user_admin()
returns boolean
language sql security definer stable
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.is_staff_user()
returns boolean
language sql security definer stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'mod') and is_approved = true
  );
$$;

create or replace function public.prevent_self_privilege_escalation()
returns trigger
language plpgsql security definer
as $$
begin
  if (new.role is distinct from old.role or new.is_approved is distinct from old.is_approved)
     and not public.is_current_user_admin() then
    raise exception 'Nur Admins dürfen Rolle oder Freigabestatus ändern.';
  end if;
  return new;
end;
$$;

create trigger trg_prevent_privilege_escalation
  before update on public.profiles
  for each row execute function public.prevent_self_privilege_escalation();

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  is_first boolean;
begin
  select not exists(select 1 from public.profiles) into is_first;

  insert into public.profiles (id, email, display_name, role, is_approved, approved_at)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    case when is_first then 'admin' else 'user' end,
    is_first,
    case when is_first then now() else null end
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- --- profiles ------------------------------------------------------
create policy "profiles: view own or shared"
  on public.profiles for select
  using (id = auth.uid() or public.is_approved_user());

create policy "profiles: staff view all"
  on public.profiles for select
  using (public.is_staff_user());

create policy "profiles: update own"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "profiles: admin update all"
  on public.profiles for update
  using (public.is_current_user_admin())
  with check (public.is_current_user_admin());

create policy "profiles: insert own"
  on public.profiles for insert
  with check (id = auth.uid());

-- --- recurring_availability / date_availability ---------------------
create policy "recurring_availability: crud own"
  on public.recurring_availability for all
  using (public.is_approved_user())
  with check (user_id = auth.uid() and public.is_approved_user());

create policy "date_availability: crud own"
  on public.date_availability for all
  using (public.is_approved_user())
  with check (user_id = auth.uid() and public.is_approved_user());

-- --- games ------------------------------------------------------------
create policy "games: select all approved"
  on public.games for select
  using (public.is_approved_user());

create policy "games: staff insert"
  on public.games for insert
  with check (public.is_staff_user());

create policy "games: staff update"
  on public.games for update
  using (public.is_staff_user());

create policy "games: staff delete"
  on public.games for delete
  using (public.is_staff_user());

-- --- events -----------------------------------------------------------
create policy "events: select all approved"
  on public.events for select
  using (public.is_approved_user());

create policy "events: insert approved"
  on public.events for insert
  with check (public.is_approved_user());

create policy "events: update own or hosted"
  on public.events for update
  using (
    public.is_approved_user()
    and (created_by = auth.uid() or host_id = auth.uid())
  );

create policy "events: staff update any"
  on public.events for update
  using (public.is_staff_user());

create policy "events: own or hosted delete"
  on public.events for delete
  using (
    public.is_approved_user()
    and (created_by = auth.uid() or host_id = auth.uid())
  );

create policy "events: staff delete"
  on public.events for delete
  using (public.is_staff_user());

-- --- event_participants / event_food_items ---------------------------
create policy "event_participants: select all approved"
  on public.event_participants for select
  using (public.is_approved_user());

create policy "event_participants: upsert own rsvp"
  on public.event_participants for all
  using (public.is_approved_user())
  with check (user_id = auth.uid());

create policy "event_food_items: crud all approved"
  on public.event_food_items for all
  using (public.is_approved_user());

-- --- app_settings -------------------------------------------------------
create policy "app_settings: select approved"
  on public.app_settings for select
  using (public.is_approved_user());

create policy "app_settings: staff update"
  on public.app_settings for update
  using (public.is_staff_user());

-- =====================================================================
-- 7. STORAGE: Avatar-Uploads + Spiel-Cover
-- =====================================================================
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "avatars: public read"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "avatars: owner upload"
  on storage.objects for insert
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatars: owner update"
  on storage.objects for update
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatars: owner delete"
  on storage.objects for delete
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

insert into storage.buckets (id, name, public)
values ('game-covers', 'game-covers', true)
on conflict (id) do nothing;

create policy "game-covers: public read"
  on storage.objects for select
  using (bucket_id = 'game-covers');

create policy "game-covers: staff upload"
  on storage.objects for insert
  with check (bucket_id = 'game-covers' and public.is_staff_user());

create policy "game-covers: staff update"
  on storage.objects for update
  using (bucket_id = 'game-covers' and public.is_staff_user());

create policy "game-covers: staff delete"
  on storage.objects for delete
  using (bucket_id = 'game-covers' and public.is_staff_user());
