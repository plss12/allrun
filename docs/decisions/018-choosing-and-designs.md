# 018 - Choosing what to make, and designs (R4)

Date: 2026-11-12

Status: done. Builds ADR 009's "Choosing what to make" (R4). Supersedes, in ADR 007, AllRun's four
template recipes and where templates are chosen; the user's saved designs keep ADR 007's storage.
The filters have their own record (ADR 017), and the pieces with several photos theirs (ADR 016).

## Context

ADR 009 planned R4: choosing an activity or a summary opens the user's photos inside the app, with
the tabs Photo, Designs and Stickers; designs replace templates; a gallery of stickers; filters on
the photo; and images from the gallery as widgets. It was built in five parts, each tested on the
iPhone and on the Android: R4a the selection screen and the app's own photo grid, R4b Stickers, R4c
collages, R4d designs and R4e filters. Many decisions were taken with the owner one design at a
time, and several of ADR 009's plans changed on the way. The rules in `.claude/rules/` (`gallery`,
`editor-photos`, `editor-history`, `app-shell`) follow the app as it is; this records the decisions
and what was left out.

## Decision

### The selection screen (R4a)

- **Choosing an activity or a period opens a screen with three tabs**, Photo, Designs and Stickers
  (`app/select.tsx`), each kept mounted when another shows, so none loads again.
- **Photo is the app's own grid** (`photos/photo-browser.tsx`), Recents, Favorites and Albums, read
  with `expo-media-library`. It starts with "No photo", which opens the editor with the checkerboard,
  and a photo opens it with that photo and an empty design, only the watermark. Photos go by the
  date taken: the library can't sort by the date added, and its Recents album, read unsorted, came
  out further from it on the iPhone.
- **The same grid chooses every photo inside the editor**, in a sheet (`usePhotoPicker`), never the
  system's picker, so both phones look the same (ADR 013). It also takes several photos in order,
  with a numbered circle as on Instagram and an "Add (n)" button, for the pieces with several photos
  and the empty cells of a collage.
- **Asking for the photos again**: on Android the button always asks, because Android says it won't
  ask again as soon as its prompt is dismissed by tapping outside, though it would; only a request
  that comes back with no prompt at once opens the settings. On iOS, "Open Settings" when the system
  says it won't ask.

### Stickers (R4b)

- **The widgets with data, ready to paste**: the widget gallery's list with its sections that carry
  data (no Photos, which need one). A tap copies one and a long press saves it, as a PNG cut to the
  widget with room for its shadow, drawn at twice its size because it is pasted large.
- **One font and one color for all**, in the editor's bottom panel and its color menu, without the
  eyedropper (there is no design to take a color from) or the opacity; replicas of apps keep their
  look. A button puts each back as it was.

### Collages (R4c)

- **Layouts**: one photo, two and three in rows, one over two, four and six, from the Collages
  button and as the first row of the Designs gallery (without a border, then white, then black).
- **Each photo moves in its cell** as the canvas's photo does on the canvas, with the same gestures
  and snaps, clipped to it. Photos touch, with an optional white or black border for the whole
  design. The photo being edited stands out by dimming the others.
- **The photos aren't in the design**: it keeps the layout, the border and each placement, in an
  optional field, so every saved design still reads. A layout that shows fewer photos keeps the
  rest, which come back with one that shows them. Cells after the first use a 1,536 px copy, so six
  photos stay near 45 MB decoded.

### Designs (R4d)

- **One gallery, in the tab and in the editor** (`editor/design-gallery.tsx`): Yours first, with the
  tile that saves the current design first; then Collages, in one row that scrolls sideways; then
  AllRun's. AllRun's four old recipes (sporty, poster, classic, minimal) are retired.
- **Widgets are pieces, and designs combine pieces with their background**: everything a design
  shows can also be added alone from the widget gallery. A holder, its photos and its data are one
  piece that moves, scales and turns as a widget, so a design's photo places are image layers
  (slots and holders), not collage cells, which don't move with their frame.
- **A design must be more than a basic widget on the photo**, which the user can place themselves: a
  new piece or a creative mix (the owner's rule, after trying the Poster).
- **AllRun's designs are fifteen, closed for the MVP**, in the widget gallery's order for full rows
  of three (`READY_DESIGN_IDS`): the Polaroid and its dark version, the camera, the crop screen, the
  35 mm frame, the light negative, the film strip, the margins with three photos and with two, the
  slide viewer, the photobooth, the chat message with one photo and with two, and the calendar's
  sheet in red and in Night Ink. Each was built with the owner, who judged it on the phones.
- **The photos of the widgets and the canvas's photo go apart**: choosing a design leaves its slots
  empty, and its widgets' photos go with them on choosing another; only the camera and the crop
  screen, as big as the canvas, hold the canvas's photo. A design over a color of its own (the chat,
  the slides, the camera...) takes the canvas's photo away, so its color shows as in its thumbnail;
  the ones over the photo (Polaroid, photobooth, calendar) keep it, and without one show the
  checkerboard, not black.
- **Thumbnails of AllRun's designs and collages show our own stock photos**, never the user's, so
  the owner knows how each looks, with the activity's or period's real data: 25 photos from Pexels,
  432 px on their short side (27 MB decoded once a session), each chosen for what it shows. The
  user's designs show no photos: their photo places show the canvas's "+" and the checkerboard.
- **Both galleries, the widgets' and the designs', always draw in the story format**, whatever the
  canvas; what is chosen fits the canvas as it goes on it. Drawing each format apart was a mess
  that let pieces stick out of a wide canvas.
- **A design saved by the user keeps its photo places empty**: photos are never saved, so whoever
  uses it puts their own. Theirs go by format, newest first, and in the editor only those of the
  canvas's format show.
- **Changing the format keeps every widget that fitted inside the canvas still inside**, scaled
  down or moved in just enough, measured in both formats, and each remembers where it was, so going
  back to its format brings it back unchanged. The big pieces (Polaroid, photobooth) stuck out.

### Filters (R4e)

- Built in ADR 017: Chrome, Golden, Portra, Fade, Mono, Motion Blur and Zoom Blur, only on the
  canvas's own photo, alone, swiped with one finger; the photo then moves with two.

### Images as widgets

- **"Your photo"**, without a frame, with a light one or with a dark one, and the **instant photo**,
  a Polaroid with a handwritten caption of the place or of the date and data, both in the Photos
  section of the widget gallery, with every holder of the designs. Six pictures at most in a
  design, counting a collage's.

## Left for later

- **The Story button** (straight to an Instagram story) and the depth effect: their buttons are in
  place and say they are coming (roadmap, step 6).

## Alternatives discarded

- **Designs with dates** (seasonal ones that show and hide by themselves, from the app or from a
  Supabase table): the owner dropped them; a themed design, if one comes, ships by EAS Update.
- **More designs**: Duo, Poster, Day, Route, Receipt and Music are basic widgets on the photo, and
  Band (a photo in a band with a line of data and the logo) is covered better by Margins.
- **The user's photos in the thumbnails**: each design must look the same every time, and the same
  stock photos in the user's own designs looked repetitive.
- **Each gallery in the canvas's format**: pieces stuck out of wide canvases and the gallery had to
  be laid out again on every change of format.
- **The design's photo carried into its slots, or a widget's photo becoming the background**: the
  owner wants them apart; carrying left cells empty or moved photos where they weren't expected.
- **The system's photo picker**: it can't sit in a screen with the Designs and Stickers tabs, and
  it looks different on each phone.
