# 021 - The map under the routes

Date: 2026-11-13

Status: accepted (2026-11-13).

## Context

ADR 009 put a map under the routes for milestone 4, from Mapbox or MapTiler with the key behind
Supabase. The owner wants it free, for good, also once the app is paid and has many users.
Checked on 2026-11-13:

- **Mapbox** (what Strava uses): 50,000 static images a month free, then 1 $ per 1,000. Every
  home card with a map spends one: a few hundred active users go past it.
- **MapTiler**: its free plan is for non-commercial use only.
- **The phones' own maps** (Apple Maps, Google Maps): free, but each phone would show a different
  map (against ADR 013), Google's key needs a billing account and Google's terms don't allow its
  map content outside a Google map, as in an exported image. Share Aura, iPhone only, seems to
  use Apple's.
- **OpenFreeMap**: OpenStreetMap's data as vector tiles (OpenMapTiles schema), free with no limit
  on requests, no key, no registration, commercial use allowed; run on donations, with no
  guarantee. The same setup is open source and can be self-hosted.

A prototype drew OpenFreeMap's tiles with Skia (CanvasKit) under synthetic routes in Madrid,
Barcelona, Paris and New York: a dark, muted map, 4 to 20 tiles (zoom 14) per image. The owner
chose the muted style with no labels.

OpenStreetMap's attribution guidelines ask for the credit near the map, or on a screen shown at
start, and findable later. The owner doesn't want it on any map, image or the launch screen
(it would show many times on the home): only in the profile.

## Decision

- **OpenFreeMap's vector tiles, drawn by the app with Skia**: the same map on both phones, in
  the app's style, vector at any export size, no native code (it runs in Expo Go), no key and so
  nothing to keep behind Supabase. Tiles are decoded with `@mapbox/vector-tile` and `pbf` (pure
  JavaScript, fine on Hermes).
- **The style** (the owner's choice, "apagado"): the app's dark background, streets in grays by
  their class (motorways widest, paths thinnest), parks and woods in a barely green gray, water in
  a barely blue one; no labels, no buildings, no points of interest. The route on top as today.
- **Tiles on the phone**: the tile URLs come from OpenFreeMap's index (it names the data's
  version), and every tile is kept in the app's cache directory, so a card or an export asks for
  none twice; the oldest go past a size limit. OpenStreetMap's data has no time limit like
  Strava's. The address is one setting: if OpenFreeMap fails or closes, a self-hosted copy of the
  same tiles replaces it.
- **Credit**: a "Credits and licences" section in the profile: map data © OpenStreetMap
  contributors (ODbL, with a link to openstreetmap.org/copyright), © OpenMapTiles, and
  OpenFreeMap. Nothing on maps, exported images or the launch screen (the owner's decision,
  knowing the guidelines ask for more).
- **Where the map shows**: under the route of the home's activity cards first; then, in the
  editor, a "with map" variant of the route with a big datum; other widgets once the owner has
  seen it.
- **Place names don't come from the map**: OpenMapTiles has cities, towns and regions but no
  provinces. They stay with the phone's geocoder, from where the route starts (never where the
  phone is). Apple's geocoder puts Spain's province where Google's puts the community, so a
  table of the 52 provinces (`core/spain-provinces.ts`) finds it in either field and writes it
  the same on both phones ("Andújar, Jaén"); a provincial capital names its community instead
  ("Jaén, Andalucía"). Every permission is asked for as the app opens (the owner's decision),
  Android's location among them.
- **Pure parts tested in `src/core/`**: the tile math (Web Mercator, which tiles cover a box,
  which zoom) and the style (each OpenMapTiles class to its color, width and order).

## Alternatives discarded

- **Mapbox static images**: the simplest, but paid past a limit the home cards would soon reach,
  and an image per card rather than shapes to draw in the app's style.
- **MapTiler**: non-commercial only on its free plan.
- **Apple Maps and Google Maps**: two different maps, Google's terms against exports, a billing
  account for Google's key.
- **Labels**: the owner wants none; the map is a quiet background.
- **Place names from the map's data**: no provinces in OpenMapTiles, and the phone's geocoder
  already gives them.
