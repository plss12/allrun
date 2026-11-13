# 021 - The map under the routes

Date: 2026-11-13

Status: accepted (2026-11-13).

## Context

ADR 009 put a map under the routes for milestone 4, from Mapbox or MapTiler with the key behind
Supabase. The owner wants it free, for good, also once the app is paid and has many users.
Checked on 2026-11-13:

- **Mapbox** (what Strava used for years): 50,000 static images a month free, then 1 $ per
  1,000. Every home card with a map spends one: a few hundred active users go past it.
- **MapTiler**: its free plan is for non-commercial use only.
- **The phones' own maps** (Apple Maps, Google Maps): free, but each phone would show a different
  map (against ADR 013), Google's key needs a billing account and Google's terms don't allow its
  map content outside a Google map, as in an exported image. Share Aura, iPhone only, seems to
  use Apple's.
- **OpenFreeMap**: OpenStreetMap's data as vector tiles (OpenMapTiles schema), free with no limit
  on requests, no key, no registration, commercial use allowed; run on donations, with no
  guarantee. The same setup is open source and can be self-hosted.

Strava went the same way (checked on 2026-11-13): OpenStreetMap through Mapbox from 2014 to
2021, then its own server for the static maps (Meridian, Go and Mapnik) because Mapbox cost too
much at its volume, its own map engine from FATMAP in March 2025, and by late November 2025 its
route maps credit "© OpenMapTiles © OpenStreetMap": OpenStreetMap's data in the same schema
OpenFreeMap serves, most likely built by Strava itself (who makes its tiles isn't public). Its
users complained of big labels and a cluttered look. Strava draws its feed maps on its servers;
this app draws them on the phone, which costs no server however many users come.

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
  same tiles replaces it (Planetiler, the tool OpenFreeMap uses, builds the whole planet in a few
  hours on one machine).
- **The zoom follows the scale** (`core/map-tiles.ts`): the deepest zoom whose tiles are drawn at
  least 512 px wide (MapLibre's and Mapbox's size), at most 14, from the size in the design's
  units, so every phone and the exported image show the same detail. A 1,080 px square takes 4
  to 16 tiles: zoom 14 for a 3 km route, 13 for 5 km, 12 for 10 km, 10 for a marathon. Always
  zoom 14, as in the prototype, would take up to 20 tiles of up to 600 KB each in a city center
  (gzipped; most of it points of interest and house numbers the map doesn't draw), where a zoom
  13 one weighs some 100 KB.
- **Credit**: a "Credits and licences" section in the profile: map data © OpenStreetMap
  contributors (ODbL, with a link to openstreetmap.org/copyright), © OpenMapTiles, and
  OpenFreeMap. Nothing on maps, exported images or the launch screen (the owner's decision,
  knowing the guidelines ask for more).
- **Where the map shows**: under the home's activity cards first, the whole card (as Share Aura:
  the route fitted in a square of its own between the header and the data, every card as tall);
  then, in the editor, a "with map" variant of the route with a big datum; other widgets once the
  owner has seen it.
- **Place names don't come from the map**: OpenMapTiles has cities, towns and regions but no
  provinces. They stay with the phone's geocoder, from where the route starts (never where the
  phone is). Apple's geocoder puts Spain's province where Google's puts the community, so a
  table of the 52 provinces (`core/spain-provinces.ts`) finds it in either field and writes it
  the same on both phones ("Andújar, Jaén"); a provincial capital names its community instead
  ("Jaén, Andalucía"). Every permission is asked for as the app opens (the owner's decision),
  Android's location among them.
- **Pure parts tested in `src/core/`**: the tile math (`map-tiles.ts`: Web Mercator, which tiles
  cover a drawing, which zoom, where each tile lands) and the style (`map-style.ts`: each
  OpenMapTiles class to its color, width and order). Over a map, the route is projected with the
  map's viewport (Web Mercator), not with `projectRoutes`, so both line up.

## Alternatives discarded

- **Mapbox static images**: the simplest, but paid past a limit the home cards would soon reach,
  and an image per card rather than shapes to draw in the app's style.
- **MapTiler**: non-commercial only on its free plan.
- **Apple Maps and Google Maps**: two different maps, Google's terms against exports, a billing
  account for Google's key.
- **Labels**: the owner wants none; the map is a quiet background.
- **Always zoom 14**: as the prototype; up to 20 heavy tiles per image, and long routes buried
  under every street.
- **Place names from the map's data**: no provinces in OpenMapTiles, and the phone's geocoder
  already gives them.
