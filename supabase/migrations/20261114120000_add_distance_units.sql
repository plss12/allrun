-- The unit of distance of the app and its images, chosen in the profile and kept with the account:
-- the phone's region's (`system`, as every account had until now), kilometers or miles. A user may
-- change it.
alter table public.profiles
  add column distance_units text not null default 'system'
    check (distance_units in ('system', 'km', 'mi'));

grant update (distance_units) on table public.profiles to authenticated;
