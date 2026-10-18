# 005 - Editor interaction model

Date: 2026-10-18

## Context

The editor is the core of the app: a photo with data widgets laid over it, edited with the
fingers on a phone. It has to feel like the story editors people already know (Instagram) while
never producing something that looks broken, and it must stay smooth with a large photo and many
widgets. Most of these choices came from testing on an iPhone.

## Decision

### Two steps on one canvas

1. **Photo and format:** pick the photo, the canvas format and the framing (drag, pinch, rotate).
   The default widgets show, so the photo can be framed around them, but they ignore touches
   (`layersLocked`): every gesture frames the photo. The photo is optional: without one the
   canvas shows a dark transparency checkerboard and the image exports transparent, as a sticker.
2. **Design:** the widgets. The photo can still be framed, but neither replaced nor given another
   format.

Widgets sit at positions relative to the canvas, so they follow a format change, but a layout
made for 9:16 piled up at 1.91:1 and looked like a bug. Going back to the first step keeps the
widgets; changing the format there after editing them asks first, then starts a new design with
the new format's default layout and an empty history. Both steps share the canvas, so it doesn't
move between them; only the controls change.

The five formats are fixed (9:16, 3:4, 4:5, 1:1, 1.91:1) and shown as their shape and ratio.

### Undo, redo and Start over

They cover only the widgets (`EditorLayers` in `src/core/editor-document.ts`, in a `History` of
at most 100 steps): the format and the framing are chosen first and stay as they are. The
history holds `null` while the design is the format's default layout and the user's layers once
edited. Each gesture or change is one step, committed when the fingers lift; during a gesture
the value lives in a Reanimated shared value on the UI thread, never in React state per frame.
Start over goes back to the default layout of the current format, as one more undoable step.

Accepted risk: a missed drag on a widget moves the photo, and that can't be undone.

### Gestures

What a gesture moves is decided when it starts: the layer under the fingers (with a 44 pt
minimum touch area), else the photo. A tap selects a layer or clears the selection. Layers snap
to the canvas center lines, to its edges (keeping a 24 px margin) and to straight angles within
4°, with guides and a light haptic; the photo snaps to straight angles too and always covers the
canvas, rotated or not (no empty corners, unlike Instagram). Dragging a layer shows a trash at
the bottom; dropping it there removes it. Everything the gestures do can also be done from the
selected layer's buttons.

### Controls and header

The controls under the canvas have a fixed height, so the canvas never changes size: a row of
tiles (the formats, the quick actions "Add element" and "Text" when nothing is selected, or the
selected layer's actions) that the style panel replaces, and the main buttons. The header holds
the native back button and Start over on the left, undo and redo on the right: two on each side,
because UIKit only centers the title when it fits mirrored around the wider side.

Going back while designing returns to the first step (`usePreventRemove`). The iOS swipe back is
off in that step: react-native-screens lets UIKit pop the screen and pushes it back afterwards,
which flashes the previous screen.

### Style

Few, visual options: color swatches (no free picker), five opacity presets, ten fonts named by
the style they give (Modern, Sport, Comic, Signature…) rather than by name. Shadows are automatic:
a widget whose color has a WCAG luminance above 0.1 casts a soft dark shadow so it reads over any
photo; darker colors go without, since a dark shadow would only blur them. Default designs use
one font for every widget; each starter template (milestone 3d) will bring its own.

### Typing over the photo

Free text is typed like in a story editor: the text rises from its place to just above the
keyboard, straight and readable, over the photo so its real contrast shows, and settles back on
"Done". It is a native text field styled like the widget (selection, copy and paste work), and
the whole edit is one undo step.

## Alternatives discarded

- **One editing step with a free format switch:** layouts broke when switching between tall and
  wide formats.
- **Undoing the format and framing too:** undo stepped through photo adjustments when the user
  only wanted to fix a widget, and Start over threw away the framing.
- **Re-laying out custom widgets on a format change:** no automatic rule keeps a free design
  looking intended in a very different proportion.
- **Shadow as a setting:** one more choice for something that has a right answer per color.
- **Swipe back that returns to the first step:** see above; react-native-screens can't cancel
  the native pop cleanly.
