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
- **The style** (the owner's choice, "apagado", `core/map-style.ts`): the app's dark background,
  streets in grays by their class (motorways widest; paths, tracks and piers thinnest and darker),
  squares filled as paths, railways and trams thin and darker, under the streets. The ground barely
  tinted: lawns (where city parks come from), sports grounds, athletics tracks, cemeteries and
  recreation grounds in a green gray, woods a little darker, beaches warm, rock gray, glaciers cold,
  wetlands between water and green, and farmland, under everything, almost not at all. Water, its
  areas and its lines (rivers, canals, streams) in one blue gray, so a river's middle line and a
  marina's sailing channels vanish into their water. Nothing underground; no labels, buildings,
  points of interest, boundaries, built-up land (homes, industry, schools…), works or ferries; no
  protected areas (the `park` layer: national parks and reserves by their legal bounds, not seen on
  the ground, which covered Peñalara whole in one green). The owner chose each on 2026-11-13, from
  sheets of five places (Retiro, Barceloneta, Peñalara, Andújar, Casa de Campo). The route on top
  as today.
- **Tiles on the phone**: the tile URLs come from OpenFreeMap's index (it names the data's
  version), and every tile is kept in the app's cache directory, so a card or an export asks for
  none twice; the oldest go past a size limit. OpenStreetMap's data has no time limit like
  Strava's. The address is one setting: if OpenFreeMap fails or closes, a self-hosted copy of the
  same tiles replaces it (Planetiler, the tool OpenFreeMap uses, builds the whole planet in a few
  hours on one machine). As built (`data/map-tiles.ts`, `data/map-tile-loader.ts`): the index is
  read once per run; a tile is kept trimmed to what the map draws (`trimMapTile` in
  `core/map-tile-decode.ts`: the features the style paints, with their class and subclass, still a
  vector tile) and uncompressed, under its zoom, column and row without the data's version (an
  older tile shows the same streets), up to 64 MB, the oldest kept first to go; a tile asked for
  twice at once loads once, and a kept one that doesn't decode is deleted and asked for again. The
  layers the map doesn't draw are skipped without being read, and the features are gathered by
  paint, so a tile draws in a dozen paths. A zoom 14 tile of central Madrid comes as 600 KB
  gzipped (1 MB uncompressed, mostly points of interest, buildings, house numbers and names) and
  is kept as some 45 KB; the 26 tiles of the five places above, 4.7 MB, as 553 KB.
- **The zoom follows the scale** (`core/map-tiles.ts`): the deepest zoom whose tiles are drawn at
  least 512 px wide (MapLibre's and Mapbox's size), at most 14, at the scale of the same view in an
  image 1,080 px wide (`planMap` in `core/map-drawing.ts`), so a home card shows the detail of its
  exported image. A 1,080 px square takes 4 to 16 tiles: zoom 14 for a 3 km route, 13 for 5 km,
  12 for 10 km, 10 for a marathon. Zoom 13 at most was tried and dropped (2026-11-13): its tiles
  are much lighter to download (a fifth, in a city center), but lose the paths inside parks and
  the small lawns and pools; trimmed, zoom 14 is kept in about the same room. Its cost is the
  first download, some 2 MB for a card in central Madrid, far less elsewhere, and once: the
  cards of one place share their tiles.
- **Drawing** (`ui/map-picture.ts`, `ui/use-map-picture.ts`): each tile's groups made into Skia
  paths once (one SVG string per group, a single call), kept for the 64 tiles last used; a card's
  map recorded as one picture, clipped to the card, each tile clipped to its square without
  antialiasing (neighbors share their edge pixels, no seam) and scaled into place, line widths
  given for 1,080 px. It shows once all its tiles are in, never with holes; until then, the
  card's gradient. The route is projected with the same viewport (`frameViewport`, Web
  Mercator), so both line up, with or without the map.
- **Credit**: at the end of the profile, under deleting the account, one line of small text as
  Strava writes its maps' credits (the owner's choice, 2026-11-13: no section, no card, no
  explanation): "© OpenStreetMap" (linking to openstreetmap.org/copyright, where the ODbL is),
  "© OpenMapTiles" and "OpenFreeMap", each a link. Nothing on maps, exported images or the launch
  screen (the owner's decision, knowing the guidelines ask for more).
- **Where the map shows**: under the home's activity cards first, the whole card (as Share Aura:
  the route fitted in a square of its own between the header and the data, every card as tall);
  then, in the editor, a "with map" look of the route with a big datum (`bigPair` and `bigTrio`
  with `layout: 'map'`, in the route's tile of the gallery; the owner's choice: the map in a
  rounded square as wide as the big datum, over it, rather than behind the whole widget). The
  map's square fits the route with a tenth of room around (`editor/widget-map.ts`); its tiles
  depend only on the route and the square's shape, so the editor loads them for the activity as
  it opens (`loadWidgetMap`, at the zoom of a 1,080 px square) and every widget, thumbnail and
  export draws from them, a picture recorded once per view (`mapPicture`). Until they load, the
  widget draws the route alone. The owner liked it and asked for it in the gallery's tile before
  the route alone, and for the basic route widget on its map too (`map: true` on the route
  layer: a rounded square 640 wide in the design, the line over it in the layer's look), offered
  as solid, with a glow and on its map; its dashed and dotted lines were dropped from the gallery,
  and a period's routes too (saved designs still draw them).
- **A period's places** (`core/period-places.ts`, `periodRouteData` with a `place`): a period's
  routes can't share one map when they were done in several places (a race away, a holiday: a map
  over both would leave the routes as dots). So a period's routes are grouped by place, as the
  overlaid routes already were, and each place gets its own pages, its routes on its map where
  they really are, the period's name and the place's over it and the place's totals under it (the
  owner's idea: no route is left out); the overlaid routes without a map keep the whole period.
  At most 10 places, those with most activities first; each named by the phone's geocoder.
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
- **Protected areas** (the `park` layer): bounds on paper, not on the ground.
- **Keeping the tiles as they come**: up to 1 MB each in a city; a cache of 64 MB would hold a few
  dozen cards.
- **Always zoom 14**: as the prototype; up to 20 heavy tiles per image, and long routes buried
  under every street.
- **Place names from the map's data**: no provinces in OpenMapTiles, and the phone's geocoder
  already gives them.
