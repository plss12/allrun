-- Strava connections (ADR 020): each user's Strava athlete and tokens. Only the Edge Functions
-- read it, with the service role: no grant at all for `anon` or `authenticated`, and row level
-- security on with no policy, so the Data API gives users nothing even if a grant slipped in. The
-- tokens are encrypted by the functions (AES-GCM, the key in their secrets): the table alone
-- opens no one's Strava.

create table public.strava_connections (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- One Strava athlete belongs to one account: connecting it from another moves it there.
  athlete_id bigint not null unique,
  athlete_name text not null default '',
  -- The scopes the athlete granted, as Strava lists them ("read,activity:read_all,...").
  scope text not null,
  -- Encrypted: the IV and the ciphertext, in base64.
  refresh_token text not null,
  access_token text not null,
  -- When the access token stops working.
  expires_at timestamptz not null,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.strava_connections is
  'Each user''s Strava athlete and encrypted tokens (ADR 020), for the Edge Functions alone.';

alter table public.strava_connections enable row level security;

revoke all on table public.strava_connections from public, anon, authenticated;
grant select, insert, update, delete on table public.strava_connections to service_role;
