# 003 - Accounts and template storage

Date: 2026-10-16

## Context

Future features (paid plans, features unrelated to Strava, users without Strava) will need a real
account. A full login in the MVP brings costs: Apple requires Sign in with Apple when other social
logins exist and in-app account deletion, plus password recovery, email verification and more
GDPR surface, all for features that don't exist yet.

## Decision

- **MVP:** a Supabase anonymous user is created silently on first launch, plus "Connect with
  Strava". Strava tokens are stored on the device (`expo-secure-store`); the server stores no
  activity data. The anonymous user also lets only our app call the OAuth Edge Functions.
- The code works with a `userId` from the start.
- **Later:** real login (Apple, Google, email) links the anonymous user, with no migration.
- **Templates:** stored locally as JSON in the MVP. **When real login arrives, user templates must
  sync to Supabase so the user has them on every device.** This is a firm requirement.

## Alternatives discarded

- **Full own login in the MVP:** extra friction and store requirements for no current benefit.
- **No auth at all in the MVP:** the OAuth functions would be an open endpoint, and adding
  identity later would need a migration.
