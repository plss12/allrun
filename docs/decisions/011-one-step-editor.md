# 011 - The one-step editor (R3)

Date: 2026-10-30

Status: done. Supersedes, in ADR 005, "Two steps on one canvas", "Undo, redo and Start over",
"Controls and header", the photo always covering the canvas (in "Gestures") and the style options
(in "Style"); and, in ADR 007, where templates are chosen and what the user's templates keep.

## Context

ADR 009 redesigned the editor after AURA's: one full-screen step, the photo free on the canvas,
the widgets' tools beside them. It was built in four parts (R3a to R3d), each tested on the
iPhone, and each changed rules that ADR 005 (the editor's interaction) and ADR 007 (templates) had
set for the two-step editor. `.claude/rules/editor.md` follows the editor as it is; this records
the decisions and what they replaced.

## Decision

### One step, full screen (R3a)

- **The canvas fills the screen and the controls float over it**, with no native header: close,
  undo, redo and Start over at the top left; adding an image, depth and the folding column
  (Collages, Designs, Ratio, KM/MI, ES/EN, Activity) at the top right; the photo, "+" and "Aa" at
  the bottom left, Export in red at the bottom right. A button whose feature comes later says so.
- **The photo is picked from the canvas**, with no step of its own: without one the canvas shows
  the checkerboard and "Choose photo", and the image exports transparent.
- **Undo covers the whole design** (`EditorDesign`: format, photo placement, background, widgets,
  unit and language), one step per gesture or change. A format change keeps the widgets in their
  relative places, without asking, and undo brings the old format back; ADR 005 reset the design.
  Start over brings everything back as the editor opened but the format and the photo. The photo
  itself is not in the history: undo never swaps photos.

### The photo free on the canvas (R3b)

- **The photo can be smaller than the canvas, leave it in part and turn without zooming**, placed
  relative to the canvas (`core/photo-placement.ts`), so any copy of it lands in the same place.
  It snaps as widgets do, and to covering the canvas. Changing the photo centers it again.
- **A background shows where the photo leaves the canvas empty**: by default the photo's
  dominant color (`auto`), or a color, or nothing (a transparent PNG).

### The widget's tools beside it (R3c)

- **A selected widget's tools go in the right column**: size (a vertical slider), "Aa" (fonts and
  format; a route's line width), color and "…" (edit, duplicate, front, back, remove). Only the
  tools that apply show. Their options open in a panel at the bottom; the canvas rises just enough
  for the widget to show over it.
- **One color menu for widgets and background**: a 12 × 10 grid, an opacity bar, the brand's
  colors and the user's favorites, and an eyedropper over a snapshot of the design. It replaces
  ADR 005's swatches and opacity presets.
- **One unit and one language for the whole design** (KM/MI and ES/EN in the side menu), never one
  per widget, saved with the user's designs.

### The user's photos on the design (R3d)

- **An image layer sticks a photo of the user's over the design**, as it is or in a white or black
  frame, or as an instant photo (a Polaroid) with a handwritten caption of the activity or period
  (where and how far, or when and its main data). The layer only names its photo; the photos live
  in the editor, one copy of up to 2048 px for the screen and the export alike (a sticker never
  outgrows the canvas), decoded only while the design shows them. A design takes up to four.
- **Designs never keep the user's photos**: saving a design leaves them out, and applying another
  design keeps them on top.
- **Another activity or period fills the same design** (the Activity button of the side menu,
  with the home screen's cards): the editor loads it without leaving the workspace, so the design,
  its history and the photos stay. Widgets without data for it are hidden, not removed, and show
  again with data that has it. It is not an undo step: like the photo, the data is what the design
  is made of, not part of it.

### Templates (ADR 007)

- **Designs are chosen from the side menu** ("Designs"), not from a quick action of a design step.
- **The user's designs keep the whole design** but the photo itself and the user's photos: the
  widgets, where the photo goes, the background, and the unit and language when chosen (template
  schema version 2; version 1 migrates to a covering photo over its dominant color). Applying one
  applies all of it; AllRun's recipes only bring their widgets.

## Alternatives discarded

- **Switching the activity as an undo step:** undo would reload data and could fail, and it would
  step through data changes the user didn't make to the design.
- **Saving the user's photos with their designs:** a design is reused with other activities and
  photos; the photos belong to one image, and storing them would grow without limit.
- **A copy of each photo for the editor and another for the export:** a photo stuck on the design
  is at most as big as the canvas (1920 px), so one copy of up to 2048 px is sharp in both, and
  four photos stay within memory.
- **Moving the photo inside a Polaroid's frame:** a center crop, as an instant camera frames it,
  was enough (the user's pick).
- **Polaroids starting turned:** the user turns them if they want.
- **Resetting the design on a format change (ADR 005):** relative positions keep a design usable,
  and undo is there when it isn't.
