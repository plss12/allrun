-- Accounts (ADR 019): each user's profile and saved designs. Every row is its owner's alone, and
-- nothing is open to `anon`. New tables are no longer exposed to the Data API by themselves, so
-- every grant is explicit, and only the columns a user may change are writable.

-- Functions the API must never call live outside the exposed schemas.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- Profiles ---------------------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  -- How much of the start and the end of every route is hidden: 0 shows it whole.
  route_privacy_meters integer not null default 0
    check (route_privacy_meters in (0, 200, 500, 1000)),
  -- Consent to update emails (GDPR): off until the user turns it on, and when they last changed it.
  update_emails boolean not null default false,
  update_emails_changed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'One per user, made with the account (ADR 019): the settings and the consent to update emails.';

-- When it changed, and when the consent did, however the row is written.
create function private.touch_profile() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' and new.update_emails is distinct from old.update_emails then
    new.update_emails_changed_at := now();
  end if;
  return new;
end;
$$;

create trigger profiles_touch
  before update on public.profiles
  for each row execute function private.touch_profile();

-- A profile for every new account. It runs as its owner to write past row level security, from
-- the auth schema's trigger only: nothing exposed can call it.
create function private.create_profile() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

revoke execute on function private.touch_profile() from public, anon, authenticated;
revoke execute on function private.create_profile() from public, anon, authenticated;

create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute function private.create_profile();

alter table public.profiles enable row level security;

revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
grant update (route_privacy_meters, update_emails) on table public.profiles to authenticated;

create policy "Users read their own profile"
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "Users change their own profile"
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Saved designs ----------------------------------------------------------------------------------

create table public.user_designs (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- The template's own id, made on the phone that saved it.
  id text not null check (char_length(id) between 1 and 100),
  -- The template's JSON (photos never: their places are empty slots); null once deleted.
  template jsonb,
  saved_at timestamptz not null,
  -- Set by the server on every write: what a phone asks for when it syncs.
  updated_at timestamptz not null default now(),
  -- Deleted designs stay as a mark, so that the other phones learn it.
  deleted boolean not null default false,
  primary key (user_id, id),
  constraint user_designs_template_unless_deleted check (deleted or template is not null),
  constraint user_designs_template_size check (template is null or pg_column_size(template) <= 262144)
);

comment on table public.user_designs is
  'The designs each user saved (ADR 019), synced with their phones: the later change wins, and a delete stays as a mark.';

create index user_designs_user_updated on public.user_designs (user_id, updated_at);

create function private.touch_design() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  if new.deleted then
    new.template := null;
  end if;
  return new;
end;
$$;

revoke execute on function private.touch_design() from public, anon, authenticated;

create trigger user_designs_touch
  before insert or update on public.user_designs
  for each row execute function private.touch_design();

alter table public.user_designs enable row level security;

revoke all on table public.user_designs from anon, authenticated;
grant select on table public.user_designs to authenticated;
grant insert (id, template, saved_at, deleted) on table public.user_designs to authenticated;
grant update (template, saved_at, deleted) on table public.user_designs to authenticated;

create policy "Users read their own designs"
  on public.user_designs
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users add their own designs"
  on public.user_designs
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users change their own designs"
  on public.user_designs
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
