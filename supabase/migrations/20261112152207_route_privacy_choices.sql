-- The distances hidden at each end of a route are now 100, 200 and 500 m (the owner's choice: 1 km
-- was too much). A profile left at 1 km keeps the most the profile now offers.
alter table public.profiles drop constraint profiles_route_privacy_meters_check;

update public.profiles set route_privacy_meters = 500 where route_privacy_meters = 1000;

alter table public.profiles
  add constraint profiles_route_privacy_meters_check
  check (route_privacy_meters in (0, 100, 200, 500));
