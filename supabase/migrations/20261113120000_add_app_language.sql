-- The language of the app's interface, chosen in the profile and kept with the account: the
-- phone's (`system`, as every account had until now) or one the app has. A user may change it.
alter table public.profiles
  add column app_language text not null default 'system'
    check (app_language in ('system', 'es', 'en'));

grant update (app_language) on table public.profiles to authenticated;
