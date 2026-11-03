# 012 - Verses, quotes and chat phrases live in Supabase

Date: 2026-11-03

Status: accepted. First piece of Supabase in the app, ahead of milestone 4.

## Context

The verse, quote and chat widgets choose their words from fixed lists, written in the locales and
closed by `z.enum` in the template schema. Adding a phrase meant changing code and shipping an
update. The owner wants to add and remove them alone, with weekly or seasonal phrases, and without
users updating the app.

## Decision

- **One table, `public.phrases`, edited in Supabase's dashboard.** A row per phrase: `id`, `kind`
  (`verse`, `quote`, `chat`), `position`, `text_es`, `text_en`, `source_es`, `source_en`,
  `starts_on`, `ends_on`, `active`, and `updated_at`, set by a trigger. New rows get their `id` from
  the database; the current phrases keep theirs, the ones saved designs already use.
- **Anyone can read, nobody can write through the API.** Row level security on, a `select` policy
  and a `select` grant for `anon` and `authenticated`. Only the dashboard writes. The app sends the
  publishable key, which is public; the secret key never reaches the app or the repo.
- **The table refuses what would look wrong:** both languages are required, a source is required in
  verses and quotes and refused in chat phrases, and texts have a maximum length (150 characters in
  verses and quotes, 60 in chat phrases, like the ones users write).
- **The app always reads a local copy.** The list opens at once and never waits for the network. The
  app ships with the current 68 phrases for the first launch; a downloaded list replaces them in a
  JSON file on the phone. It looks for changes in the background, at most once a day, asking only for
  the latest `updated_at` and the number of rows, and downloads the whole table if they differ. It
  validates what it downloads with Zod: a bad row is dropped and logged, the others stay.
- **Which phrases a list shows** is decided by the phone's local date:
  - without dates: always, by `position`;
  - with `starts_on` only: from that day on, by `position`;
  - with `ends_on` (with or without `starts_on`): while in date, and heading the list, by `position`
    among themselves. A phrase with only `starts_on` doesn't head it: it would stay on top forever.
- **Saved designs keep the phrase's `id`, not its words.** A fixed typo also reaches them; exported
  images don't change. A phrase turned off or out of date leaves the list but still draws in the
  designs that use it, so the download includes every row. If a row is really deleted, the built-in
  phrase with that `id` draws it, and otherwise the first built-in of its list. The template schema
  now reads ids as strings: it is wider, so no version bump.
- **The gallery's cover is measured, not counted.** Measuring every phrase showed that the "Tap to
  choose" hint doesn't cover long ones: they wrap to three lines at most and shrink, so they fill the
  tile's width and get too small to read. So a tile never draws a widget chosen from a list over its
  hint, and its cover is the first phrase of the list whose words, drawn in the tile with the real
  font and language, measure at least 10 points. A long dated phrase heads the list but doesn't
  become the cover.
- **These texts leave i18next.** They are data, not interface: `t()` keeps the interface's words, and
  the translations of a phrase travel in its row.

## Alternatives discarded

- **An Excel file in the repo, turned into code by a script:** no backend, but every change needs a
  commit and an app update, and dated phrases would be impossible.
- **Firebase, Cloudflare D1 + Workers, Turso, Neon:** more generous in some limit, but milestone 4
  needs anonymous users, OAuth functions for Strava's secret and template sync (ADR 001 and 003), and
  a second backend for a small table isn't worth it.
- **Asking the table on every list opening:** a visible wait and a cost that grows with use.
- **Keeping the words in saved designs:** a design would freeze one language, and the widget's language
  is chosen per design and can change later.
- **A character limit for the cover:** letters, fonts and languages differ, and the app already lays
  the phrase out for the gallery, so it can look at what really happens.
- **A command drawing the table's phrases on a sheet:** built and then removed. The table's
  constraints, the measured cover and a test at the maximum length already cover what could go wrong,
  and in development the app reads the table on every launch, so the phone itself shows a new phrase,
  drawn for real. A typo is fixed in the dashboard, and reaches users within a day.
- **A `theme` column:** the app has no sections by theme, and dates already cover Christmas or New
  Year's Eve. Adding it later breaks nothing.
