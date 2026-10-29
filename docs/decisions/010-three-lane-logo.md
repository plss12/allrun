# 010 - A three-lane logo only

Date: 2026-10-29

Status: done.

## Context

The original AllRun logo (Pedro Luis Soto Santos, 2026) draws the R as an athletics track of four
lanes that runs through the A. At small sizes, four lanes and the lines between them ran together,
so the app's icons, the launch screens and the editor's watermarks were already drawn with a
reduced monogram of three lanes. The four-lane version still lived in `docs/marca`: the original
files, and variants generated next to their three-lane twins. Nothing in the app used it, but two
versions side by side invited picking the wrong one.

## Decision

- **The logo has three lanes, everywhere.** They fill the same radii as the original's four (95
  to 215, in the units of the 880.57 × 600 drawing): three lanes of 32 with gaps of 12, instead of
  four of 24 with gaps of 8. Everything else (the A, the stem, the legs, the wordmark, the colors)
  is the original design.
- **`scripts/brand/build-brand.mjs` is the source of truth.** It holds the original coordinates
  and draws every brand file from them into `docs/marca` (the monogram, the wordmark, the logo
  stacked as the original and horizontal, in color, white and black, the horizontal one on dark
  too, and the icon), the app's icons into `assets/images`, and the geometry the editor draws with
  Skia (`src/editor/brand/geometry.generated.ts`). `npm run brand` rebuilds them all.
- **The four-lane files were removed** (the originals and their generated variants); git's history
  keeps them. The brand guide (`docs/marca/AllRun · Guía de marca.docx`) describes three lanes,
  says why, and shows the three-lane files.

## Alternatives discarded

- **Keeping the four-lane version for large sizes** (print, the web), where its lines do show: two
  versions of one logo split its identity and invite using the wrong one, and three lanes read as
  well large.
- **Keeping the original files untouched as a record**: git's history already keeps them; in the
  folder they looked current.
