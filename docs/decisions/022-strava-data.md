# 022 - What else Strava's data gives: cadence, steps, zones and records

Date: 2026-11-14

Status: built (2026-11-14), to be judged by the owner on both phones.

## Context

The owner's Strava data (a COROS PACE 4, checked on the M32 on 2026-11-13, roadmap step 5) has
more than the app read: a cadence and a moving flag in every run's streams, best efforts (400 m
to the half marathon) with the athlete's records among them, and, as a subscriber, each
activity's time in zones (`GET /activities/{id}/zones`: heart rate, the athlete's six pace zones,
and on runs power as a histogram of 50 W buckets). Strava gives no steps; its own app counts them
with the phone's pedometer. The owner first turned steps down, then asked for an estimate from
the cadence once its data made it simple (2026-11-13).

## Decision

- **Streams**: the detail asks for `cadence` and `moving` too
  (`time,distance,altitude,velocity_smooth,heartrate,watts,cadence,moving`). The pace leaves out
  the stops Strava marks (`moving`, its own criterion, as its pace does) instead of anything under
  0.5 m/s, which also dropped slow climbs on foot; without the flag, the threshold stays
  (`withoutStops` in `core/activity-charts.ts`). Nothing else is left out: the fastest and
  slowest 2 % it used to drop, so that GPS spikes wouldn't squash the line, were the strides and
  the fastest stretches of an interval session, which then had no zone 6 in the line (the owner's
  choice, 2026-11-14: the stream as it is).
- **What the phone keeps of an activity** (ADR 020), in two parts asked for apart: its detail
  with its best efforts (`activity-<id>`, one request) and its streams and zones
  (`streams-<id>`, two). Opening an activity asks for both, three requests. A home card asks for
  nothing: Strava's lists have no calories, and a workout's card, which asked for its detail to
  show them, says its time and average heart rate instead (the owner's choice, 2026-11-14). The
  quota is the app's, shared by every user (100 reads every 15 minutes and 1,000 a day at first),
  it counts refused requests too (a 404 raised it, measured on the M32), and scrolling the
  owner's history had asked for 16 details, 48 requests, in a minute. The zones are a subscriber's ("Summit Feature" in Strava's reference, the heart rate's
  too) and answer 402/403 to anyone else, which is no error: the activity just has none. As a
  refused request counts against the quota, they are asked for only when the athlete's profile
  doesn't say they don't pay (`summit` in `GET /athlete`, kept a day, as the photo and the
  athlete's heart rate zones: the owner's choice, so that a change on Strava shows the day after),
  and a refusal is noted in the kept profile until it is asked for again. Who doesn't pay still
  has heart rate zones, counted on the stream in the athlete's own zones. What earlier versions kept (`detail-`, `detail2-`, the three
  together) goes as it gets old.
- **Cadence**: a line chart (`cadence`, after the power in the charts' order; linear, without
  smoothing, the stops and samples at 0 left out) under its average and highest cadence; on foot
  in steps a minute ("spm", "ppm" in Spanish: Strava's cadence is one leg's, twice it), walks
  too, and in turns a minute on a bike.
- **Steps** (`steps`, `stepsOf` in `core/metrics.ts`): Strava's average cadence (one leg's, with
  its decimals) × 2 × the moving time in minutes (from its seconds), as a whole number, only on
  foot and only with a cadence. Strava's average cadence is over the moving time, so this is the
  sum of the cadence along the way; the cards, which have no streams, get the same number. Walks and hikes lead with distance, time
  and steps (their card: without a cadence, distance, time and elevation or pace when flat); runs
  write them after their cadence.
- **Zones, one way for the three**: the heart rate chart's three views (the line colored by
  zone, the line and a table of the time in each, the table alone) also for the pace and a ride's
  power, when Strava gives the activity zones of them (`zonedCharts` in
  `editor/load-editor-data.ts`). The tables are Strava's own time in each zone of the activity,
  as its app shows it, the heart rate's too (`heartRateZonesOf` in `editor/editor-data.ts`);
  without them (not a subscriber), the heart rate's is counted on its stream in the athlete's
  zones as Strava counts it. Checked against Strava's tables of five of the owner's runs
  (2026-11-14): Strava counts only while moving (its seconds add up to the moving time), and a
  heart rate on an edge in the lower zone (the profile's 143–162 and 162–171 are "144–162" and
  "163–171" in an activity's); so counted, the heart rate's come within 20 s of Strava's in each
  zone (before, up to 3½ minutes off: 295 samples at 162 bpm counted in zone 3). Zones are kept as
  Strava writes them (`core/heart-rate-zones.ts`), and a value falls in a zone by the edges
  between them (`zoneEdges`: halfway between "143" and "144", or a pace's shared edge). A pace's
  ranges are written as paces, the faster first (">6'25"", "5'23"–6'25"", "<4'13"").
- **The zoned line**: drawn once per zone, each cut to its zone's horizontal band of the chart
  (`zoneBands`), so every bit of it is in the color of the zone it is in; and a heart rate runs
  along the time moving, not the distance, so each zone's stretch is as wide as the time in it, as
  in the table. Along the distance, an interval session's slow recoveries (zone 1) took 33 % of
  the line for 38 % of the time; along the time moving, the heart rate's line is off Strava's
  table by under 0.5 % of its width in the owner's runs. The owner chose it (2026-11-14) after
  seeing why the line and the table didn't match, over the clean vertical cuts chosen the same
  day from five ways drawn side by side (each step by its middle, horizontal bands, vertical cuts
  blended or clean, the line split across the stroke), where horizontal bands had looked false.
  The pace stays along the distance, as Strava draws it. Colors from the iOS
  palette the app uses: five (heart rate) grey, blue, green, orange, red; six (pace) with a
  yellow; seven (power) with a purple (`zoneColors`). Power zones are kept only when Strava gives
  seven buckets or fewer: a run's histogram isn't zones. A ride's power zones couldn't be seen
  with real data (the owner rides without a power meter); built as Strava documents them.
- **Records** (`records`, a replica in the splits ladder's look: tags in a typewriter's letters,
  as wide as its title at least): "Mejores tiempos", every best effort Strava gives the run (every
  one of its standard distances the run covered: 400 m, ½ mile, 1 km, 1 mile, 2 miles, 5K, 10K,
  15K, 10 miles, 20K, the half, 30K, the marathon, 50K), its elapsed time, and the athlete's
  records (first, second and third best: "Récord", "2.º", "3.º") in a brand color; and "Récords",
  the records alone, when there are some (`recordRows` in `core/activity-block.ts`). In each brand
  color only when it has records: without them both colors were the same table. Each effort's
  distance is known by Strava's name for it ("10 mile", "Half-Marathon"), never by its measured
  length, which may be off ("10 mile" measured 16,090 m and came out "16,09 km" at first, the
  owner's report); without a name, by its length within 1 %. In the gallery, beside the laps, and
  the splits' ladder beside the Grand Prix (the owner's choice).

## Alternatives discarded

- **Temperature, gradient and the GPS stream**: only some devices (never the owner's), derivable
  from the altitude, and the polyline is enough.
- **Steps from the phone's pedometer or Health Connect**: offered and dropped by the owner;
  Strava's data only.
- **A run's power histogram as zones**: buckets of 50 W say nothing an athlete trains by.
- **The time in pace zones counted on the stream**: Strava's own is what its app shows, and
  counted here it differs a lot: in the owner's runs, between 8 and 19 % of the time in another
  zone (a 10K time trial's zone 4: 31:15 for Strava, 24:30 on the stream). It can't be counted as
  Strava does from what its API gives: neither its speed stream as it is, nor averaged over 3 to
  60 s, nor the grade adjusted pace, nor stretches of 50 m to 1 km come within 8 %; Strava likely
  counts the watch's own speed, which the API doesn't give. So a pace's line and its table may
  disagree; the owner keeps Strava's table.
- **The zoned line as a gradient with vertical cuts** (`zoneCuts`, built and replaced the same
  day): it colored the line by where it crossed an edge, along the distance, and couldn't match
  the table; the horizontal bands show each bit in its own zone.
