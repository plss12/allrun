# 002 - Activity data sources

Date: 2026-10-16

## Context

The app needs the user's activity history (distance, time, pace, elevation, heart rate, route,
streams for charts). As of October 2026:

- **Strava:** OAuth gives access to the full history of each user who connects. New apps serve
  1 athlete, 10 after a self-service upgrade, and up to 9,999 only after a manual review with no
  guaranteed timeline. Since June 2026 the developer needs a paid Strava subscription even to
  create the API app. Data may be cached for at most 7 days. The brand guidelines don't require
  showing a Strava logo; if shown, only the official "Powered by Strava" / "Compatible with
  Strava" marks may be used, unmodified, without implying sponsorship. Strava's own logo (the
  one on its share templates) may not. The editor therefore offers only the AllRun logo
  (decided 2026-10-17).
- **Garmin:** new Connect Developer Program access paused since September 2026.
- **COROS / Suunto:** partner programs that require a company and an existing user base.
- **Apple Health / Health Connect:** usable, but Android limits history to 30 days without an
  extra permission, routes from other apps need per-route consent, Garmin/COROS/Suunto don't sync
  routes there, store reviews get stricter, and users with Strava would get duplicates.

## Decision

- **Strava is the only source in the MVP.** Most runners already use it.
- Sources sit behind an `ActivitySource` interface; a fixtures source with the Strava API shape is
  used until the Strava integration (milestone 4), so the editor can be built without the
  subscription.
- Data is fetched on demand: the recent activities list first; month/year data only when the user
  builds a summary. Local cache shorter than 7 days.
- All Strava sport types are supported, classified on two levels:
  - **Modality** (road, trail and treadmill run; walk and hike; road, mountain, gravel, e-bike
    and indoor ride; swim) decides which metrics are offered and in which order: trail runs,
    hikes and mountain bike rides lead with elevation, treadmill runs have no route or elevation.
  - **Family** (run, ride, swim, other) groups modalities for summaries, which can filter by
    family, by modality or by both. Summaries put the triathlon sports first; walks and hikes
    count as `other` (changed on 2026-10-16 after user testing).
  - Any other `sport_type` falls back to a generic profile showing whatever fields are present.
- Route privacy: "hide start/end of route" is on by default (~200 m) and adjustable, because the
  API returns the full trace to the owner.
- Request Strava's review as soon as there is a usable version, before the public launch.

## Alternatives discarded

- **HealthKit / Health Connect in the MVP:** more problems than value for this audience (see
  context).
- **GPX/FIT import:** exporting and importing a file is too much friction for a quick Instagram
  app.
- **Unofficial vendor APIs with the user's credentials:** against the vendors' terms, a security
  and GDPR risk, fragile, and grounds for store rejection.
- **COROS, Garmin and Suunto APIs:** postponed until there is traction and a company to apply
  with.
