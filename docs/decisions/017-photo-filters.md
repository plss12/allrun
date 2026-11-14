# 017 - Filters of the photo

Date: 2026-11-07

Status: accepted. Builds the filters ADR 009 planned (R4e). Changes how the photo moves, from ADR
011's "The photo free on the canvas": one finger no longer frames it, two do.

## Context

ADR 009 planned filters on the photo, changed by swiping sideways over it as on Instagram: Zoom
Blur, Motion Blur, Portra, Mono and Ink, drawn with Skia so the exported image matches the canvas.
Until now one finger on the photo moved it, pinching zoomed and two fingers turned it, so a
sideways swipe was already taken.

The owner set the limits: filters only when the canvas has a single photo of its own, never in a
collage, and never on a widget. They asked for two more, Golden and Fade, and no more than that.
On the phone, Ink as the brand's duotone (Night Ink to Chalk) didn't convince them, and they chose
Chrome in its place from a sheet of candidates.

## Decision

- **One finger swipes the filters, two move the photo.** On the canvas's photo, one finger going
  sideways brings in the next filter or the one before, as on Instagram: the current one stays on
  one side and the one coming in shows on the other, cut where the finger is. When it lifts, it
  goes on to the one past half the canvas, or the one flung toward after a little
  (`pageAfterSwipe`), and the filter's name shows big in the middle a moment. The filters go round:
  after the last comes the first (`pageBeside`, the owner's choice). Two fingers, put down together,
  move, zoom and turn the photo; a second finger during a swipe changes nothing, and only one
  finger's way counts (in quick swipes the next finger lands before the last lifts, and the photo
  jumped between them). A swipe doesn't start until the one before has put its filter on the canvas
  (one cut short broke the canvas). A finger on a widget moves it, as before.
- **Only the canvas's own photo, alone, takes a filter.** Without a photo, in a collage (each cell
  moves with one finger, as before), or with the camera or the crop screen (whose photo is the
  piece's, a widget's), the swipe does nothing. Widgets never take one.
- **The order:** the photo as it is, then the looks from the most saturated to black and white,
  Chrome, Golden, Portra, Fade and Mono, and then Motion Blur and Zoom Blur (`PHOTO_FILTERS` in
  `core/photo-filter.ts`; the owner's order, after trying them on the phone).
- **The looks are color matrices** (Skia's 4×5): Portra a warm film with soft shadows, Golden the
  light of golden hour, Chrome an old slide film (Kodachrome: strong contrast and color, warm reds,
  cool shadows), Fade a matte film with lifted blacks and Mono a black and white with some
  contrast. Being matrices, the color they give anything is worked out in
  `core` (`filteredColor`): the `auto` background is the photo's dominant color through its filter,
  grey behind a black and white photo.
- **The blurs are shaders** (SkSL, `FilteredPhoto` in `scene/photo.tsx`) that read the photo 24
  times along their way: Motion Blur sideways along the photo, 4.5 % of the canvas's width when the
  photo covers it; Zoom Blur out from the photo's middle, the edges up to 8 % of the way. They work
  in the coordinates of the photo's group, canvas pixels around its middle at the size that covers
  the canvas, which the group scales (`photoMatrix`, `photoRect`), so their sizes are the same on
  the canvas, on screen and in the exported image, and grow and shrink with the photo, as a blur
  taken with it would.
- **The filter is part of the design**, as the background: `filter` in `EditorDesign` and in the
  template, optional, so every saved design still reads, with no new version. Each change is an
  undo step and counts for Start over; it stays when the photo changes, comes with a design (AllRun's
  have none) and is saved with the user's designs; a collage keeps it without showing it.
- **Smooth on a modest phone**: when a swipe starts, the photo with the current filter and with the
  filters either side, and the widgets over it, are drawn once into textures (`sides` in
  `gesture-textures.ts`), and each frame only puts two of them on screen, cut where the finger is: a
  blur isn't drawn again on every frame. Their programs are compiled under the launch screen
  (`ShaderWarmup`). A blurred photo is drawn once into a texture, kept while the photo and its
  filter stay (`useBakedPhoto`), and the canvas draws that, also while two fingers move it: drawn
  on every frame, a blur held the M32's frames at 30-60 ms (ADR 014, third round).
- **Accessibility:** where the photo takes filters, the canvas is an adjustable value for screen
  readers, a swipe up or down changing the filter.

## Rejected alternatives

- **Moving the photo with one finger while its tools are open, and swiping filters otherwise:** two
  meanings for the same gesture depending on a mode the user can't see. Two fingers, as on
  Instagram, is one rule.
- **Filters in collages, one per cell or one for all:** the owner wants them only on a single photo.
- **A gaussian blur image filter for Motion Blur:** in Skia, image filters work in a space of their
  own once the photo turns, and a zoom blur needs a shader anyway; one kind for both keeps them
  alike.
- **Ink, a duotone of the brand's colors** (Night Ink to Chalk, or to Track Red, or a tritone of
  the three): Night Ink to Chalk looked too much like Mono on the phone, and from a sheet of
  candidates the owner chose Chrome instead.
- **Other film candidates** (Expired, Tri-X, Instant, Cine): the owner kept the list short. Grain
  and a vignette would also have needed shaders of their own.
- **Motion Blur's trail as a share of the canvas whatever the photo's size** (as first built):
  the texture a gesture draws would show it growing with a pinch and shrinking back when the
  fingers lifted.
- **Seasonal or dated filters, or more than eight pages:** few, and always the same (the owner).
