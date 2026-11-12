# 019 - Accounts

Date: 2026-11-12

Status: accepted. Supersedes ADR 003's anonymous user, which was never built, and builds its firm
requirement: the user's designs on every phone.

## Context

ADR 003 put off a real login: the MVP would create an anonymous Supabase user silently and keep
the user's designs on the phone. Before publishing, the owner wants a real account for everyone:
their designs on every phone, a profile with settings that must exist before the app is public
(hiding the start and end of routes), and room for paid plans later. Strava's sign-in gives no
email, so the accounts are AllRun's own, in Supabase Auth.

Two limits shaped it. Supabase's free plan no longer lets projects created after June 2026 edit
their emails while they send through Supabase's own server, whose emails only reach the project's
team anyway: anything sent by email needs a mail provider and a domain of our own before
publishing. And Sign in with Apple needs Apple's paid developer account, which the owner pays only
to publish (ADR 001).

## Decision

- **An account is required**, from the first launch: sign in, then connect Strava (milestone 4).
  It holds the user's designs and settings on every phone and, later, their plan. Apple allows a
  required login when the app has account-based features; the review notes will say which.
- **Three ways in** (the owner's choice), on one screen laid out as the owner showed it: the title on the left, email and password with their labels over them, the button that signs in, a line with "or", Google and Apple with their official marks, and signing up, in Track Red:
  - **Email and password**: the email confirmed by a link, at least 8 characters, and a link to
    reset a forgotten one, which opens the app. Supabase's own emails, as they are.
  - **Google**, through the system's browser (`expo-web-browser`, Supabase's OAuth with PKCE),
    with a web client in Google Cloud. A native Google sign-in needs a development build, and the
    iPhone tests in Expo Go.
  - **Apple**: native on the iPhone (`expo-apple-authentication`, in Expo Go) and through the
    browser on Android. Apple requires it next to Google: the code is ready, and it is set up and
    tested when the Apple account is paid (roadmap step 7).
  - The same verified email through two of them is one account (Supabase links them).
- **The session** is `supabase-js`'s, kept on the phone encrypted (a key in the system's secure
  store, the session in AsyncStorage: the secure store takes no more than 2 KB), refreshed while
  the app is in front.
- **Two tables, each row its owner's alone** (row level security, `to authenticated` and the
  owner's id; nothing for `anon`, and every grant explicit, as new tables are no longer exposed by
  themselves):
  - `profiles`, one per user, made when the account is: the settings and the consent to emails.
  - `user_designs`, one row per saved design: its template's JSON, when it was saved, when it last
    changed and whether it was deleted.
- **The designs stay on the phone first**, and sync with the account: on signing in, on coming
  back to the app and after each save or delete. The phone sends what changed and asks for what
  changed since its last sync; between two changes of a design, the later wins. A delete is kept as
  a mark, so the other phones learn it. Photos are never sent: a design's pictures are empty slots
  (`withEmptySlots`), and come empty on another phone. Rows are validated with the template's
  schema on reading; one that doesn't pass is logged and left out.
- **The designs saved before accounts** go to the first account that signs in on that phone.
- **Signing out** sends what is pending first, then clears the phone's designs and settings: they
  are the account's, and another person may sign in next.
- **Deleting the account**, inside the app (Apple's rule): an Edge Function checks who asks,
  deletes the user with the secret key, and the rows go with it; the phone signs out and clears.
- **Hiding the ends of routes is applied where activities come into the app** (`PrivateRoutesSource`), not where they are drawn: no screen, gallery or exported image can skip it, and changing it reloads what was shown.
- **The designs of another account on the phone** (whose session ended without signing out) are cleared, never sent to the one signing in: only those with no journal, saved before accounts, are adopted.
- **The profile**, opened by the AllRun logo on the home's top bar, in a round button on the same
  glass as the tabs, as the filter across it (the owner's choices; a second button beside the
  filter didn't fit 360 pt): the account (its email), hiding the start and end
  of routes (off; once on, 100, 200 or 500 m, 200 first: 1 km was too much), update emails, off
  until the user turns them on (GDPR: having an account doesn't grant it), with when they did, and, at the end, each on a card of its own, signing out as a Track Red button (as signing in; red words read as danger) and
  deleting the account as one on the app's usual surface, its words in the danger red. No notes under the settings (the owner's choice).

## For publishing (roadmap step 7)

- A domain and a mail provider (Resend, or another) as Supabase's SMTP, for the confirmation and
  reset emails to reach users; the same domain serves the privacy policy and support the stores
  ask for.
- Google's consent screen moved to production, and Supabase's own domain on it
  (`wikbkyfyyoxddlkkpwgm.supabase.co`) replaced by ours if the owner takes Supabase's custom
  domain.
- Sign in with Apple set up and tested, with the paid Apple account.

## Rejected alternatives

- **The anonymous user of ADR 003**: it never got built, and the owner wants everyone with an
  account before publishing.
- **An optional account**: two ways of using the app to keep working, for little.
- **A six-digit code by email**: it needs the email's template edited, which Supabase's free plan
  no longer allows without a mail provider of our own; with password, its default emails serve
  while developing.
- **A magic link**: it depends on the link opening the app, which fails in Expo Go and in some mail
  apps.
- **The session in plain AsyncStorage**: its refresh token opens the account.
