# 008 - Activity charts

Date: 2026-10-18

Status: built in milestone 3e.

## Context

An activity's shape along the way (its climbs, how the pace held, the heart rate, the power, how
each kilometer went) tells more than its totals, and is what runners and cyclists share. Strava
gives it as streams (a sample about every second: time, distance, altitude, speed, heart rate,
power) through `GET /activities/{id}/streams`, and as splits by kilometer and by mile in the
activity's detail (`GET /activities/{id}`). Neither comes with the activity list.

## Decision

- **Fetched on demand.** `ActivitySource.getActivityDetail` fetches the streams, splits and laps
  (these two from the activity's detail; the laps since ADR 009's tables of laps) only
  when an activity opens in the editor, alongside the activity. If it fails, the editor still
  works, without activity charts (the error is logged). The detail is a source-independent
  `ActivityDetail` in SI units, like `Activity`; Strava's JSON is validated with Zod and mapped in
  `sources/strava/detail.ts`. The fixtures generate streams and splits that agree with each
  activity's totals and go through that same schema.
- **One widget per chart, `activityChart`**, with its series: elevation, pace, heart rate, power
  (an area under a line) or splits (a row per kilometer or mile, with a bar longer when faster).
  The catalog only offers the charts the activity recorded data
  for: no heart rate without a monitor, no elevation on a treadmill, no splits without distance.
  Styling is shared with the period's chart: color, font, an average line, labels and title.
- **The highest value, marked.** A plain shape tells little: every line can write its highest
  value, with a dot at its top ("283 m", "6:37 min/km", "158 bpm", "221 W"). The period's chart
  writes instead every bar's value over it, at one size that fits them all, turned upwards when
  that makes them bigger (a month of days). Off by default, like the average line.
  Speed reads as each sport writes it: pace for running, pace per 100 m for swimming, km/h for
  cycling and the rest.
- **Splits as rows.** Each split goes under the previous one: its number, a bar and, on the far
  right, its pace (shown by default) and its change in altitude (hidden by default), each in a
  right-aligned column so the digits line up and an average line down the bars never crosses
  them. More than 20 splits are grouped (km 1–3, 4–6…) so a long ride still fits. Split bars
  start from the slowest at 45% of the room, so that splits a few seconds apart don't look the
  same.
- **Drawn from about 150 points.** Thousands of samples are reduced to averages of equal stretches
  of the activity (`core/activity-charts.ts`), and pace, heart rate and power are smoothed (a
  moving average), since they change with every step or pedal stroke. Pace leaves out stops and
  the 2% most extreme samples at each end (GPS jumps) and is drawn as a speed, so faster is
  higher. Lines run along the distance, or the time without one (a gym session).
- **Not in AllRun's templates.** They are added from "Add element"; the built-in templates stay as
  they were reviewed.

## Alternatives discarded

- **Splits as columns**, side by side with their numbers under them, and their pace and change
  in altitude over them: with 20 or more splits, the texts that fit over such narrow columns are
  too small to read. Templates saved with splits as columns still open, as rows.
- **Only a line, without the area:** the area reads better over a photo and is the usual shape of
  an elevation profile.
- **Fetching the streams with the activity list:** a request per activity, for charts most
  activities never get.
