-- =====================================================================
-- MIGRATION 002 · Admin-Freigabe-System, Rollen, Avatar-Storage
-- Sicher auf einer bereits laufenden DB ausführbar (idempotent).
-- In der Supabase SQL-Konsole ausführen: Dashboard -> SQL Editor -> Run.
-- =====================================================================

-- 1. Neue Spalten an profiles
alter table public.profiles
  add column if not exists email text,
  add column if not exists avatar_url text,
  add column if not exists role text not null default 'user',
  add column if not exists is_approved boolean not null default false,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references public.profiles(id) on delete set null;

-- role-Check nachträglich ergänzen (falls Spalte gerade erst angelegt wurde,
-- ignoriert Postgres den Fehler bei bereits vorhandenem Constraint-Namen nicht,
-- daher erst prüfen)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_role_check'
  ) then
    alter table public.profiles
      add constraint profiles_role_check check (role in ('user', 'mod', 'admin'));
  end if;
end $$;

-- 2. Bereits existierende User: E-Mail aus auth.users nachziehen, damit
--    /admin/users sofort sinnvolle Daten zeigt.
update public.profiles p
set email = u.email
from auth.users u
where p.id = u.id and p.email is null;

-- 3. WICHTIG: bestehende User nicht aussperren! Alle, die es aktuell schon
--    in eine Gruppe geschafft haben, automatisch freigeben. Falls du das
--    nicht willst, diesen UPDATE-Block einfach nicht ausführen.
update public.profiles
set is_approved = true, approved_at = now()
where is_approved = false
  and id in (select distinct user_id from public.group_members);

-- 4. Mindestens einen Admin sicherstellen: falls noch kein Admin existiert,
--    wird der am längsten registrierte User zum Admin gemacht.
--    -> Passe die WHERE-Bedingung an, falls du dich selbst gezielt zum
--       Admin machen willst, z. B. per E-Mail:
--       update public.profiles set role='admin', is_approved=true
--       where email = 'deine@email.de';
do $$
begin
  if not exists (select 1 from public.profiles where role = 'admin') then
    update public.profiles
    set role = 'admin', is_approved = true, approved_at = now()
    where id = (select id from public.profiles order by created_at asc limit 1);
  end if;
end $$;

-- 5. Hilfsfunktionen (create or replace = sicher wiederholbar)
create or replace function public.is_group_member(_group_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1
    from public.group_members gm
    join public.profiles p on p.id = gm.user_id
    where gm.group_id = _group_id
      and gm.user_id = auth.uid()
      and p.is_approved = true
  );
$$;

create or replace function public.is_current_user_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.is_staff_user()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'mod') and is_approved = true
  );
$$;

create or replace function public.prevent_self_privilege_escalation()
returns trigger
language plpgsql
security definer
as $$
begin
  if (new.role is distinct from old.role or new.is_approved is distinct from old.is_approved)
     and not public.is_current_user_admin() then
    raise exception 'Nur Admins dürfen Rolle oder Freigabestatus ändern.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_privilege_escalation on public.profiles;
create trigger trg_prevent_privilege_escalation
  before update on public.profiles
  for each row execute function public.prevent_self_privilege_escalation();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 6. Neue/aktualisierte Policies (alte gleichnamige zuerst droppen, damit
--    das Skript wiederholt ausführbar ist)
drop policy if exists "profiles: admin view all" on public.profiles;
drop policy if exists "profiles: staff view all" on public.profiles;
create policy "profiles: staff view all"
  on public.profiles for select
  using (public.is_staff_user());

drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists "profiles: admin update all" on public.profiles;
create policy "profiles: admin update all"
  on public.profiles for update
  using (public.is_current_user_admin())
  with check (public.is_current_user_admin());

drop policy if exists "groups: select for join via invite code" on public.groups;
create policy "groups: select for join via invite code"
  on public.groups for select
  using (
    auth.uid() is not null
    and exists (select 1 from public.profiles where id = auth.uid() and is_approved = true)
  );

drop policy if exists "events: update group" on public.events;
drop policy if exists "events: update own or hosted" on public.events;
create policy "events: update own or hosted"
  on public.events for update
  using (
    public.is_group_member(group_id)
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
    public.is_group_member(group_id)
    and (created_by = auth.uid() or host_id = auth.uid())
  );

drop policy if exists "events: staff delete" on public.events;
create policy "events: staff delete"
  on public.events for delete
  using (public.is_staff_user());

-- 7. Avatar-Storage-Bucket
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatars: public read" on storage.objects;
create policy "avatars: public read"
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "avatars: owner upload" on storage.objects;
create policy "avatars: owner upload"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars: owner update" on storage.objects;
create policy "avatars: owner update"
  on storage.objects for update
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars: owner delete" on storage.objects;
create policy "avatars: owner delete"
  on storage.objects for delete
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- =====================================================================
-- FERTIG. Prüfe danach in der Tabelle "profiles", ob mindestens ein
-- Eintrag role='admin' und is_approved=true hat:
--   select id, email, display_name, role, is_approved from public.profiles;
-- =====================================================================
