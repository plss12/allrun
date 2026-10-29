# 005 - Editor interaction model

Date: 2026-10-18

Status: partly superseded by ADR 009 as the redesign is built. Since R3a the editor is one
full-screen step, and undo covers the whole design (format, photo placement, background and
widgets); a format change keeps the widgets. Since R3b the photo moves freely and may leave the
canvas partly empty, over a background. "Two steps on one canvas", "Undo, redo and Start over",
"Controls and header" and the photo always covering the canvas (in "Gestures") describe the
editor before that.

## Context

The editor is the core of the app: a photo with data widgets laid over it, edited with the
fingers on a phone. It has to feel like the story editors people already know (Instagram) while
never producing something that looks broken, and it must stay smooth with a large photo and many
widgets. Most of these choices came from testing on an iPhone.

## Decision

### Two steps on one canvas

1. **Photo and format:** pick the photo, the canvas format and the framing (drag, pinch, rotate).
   The default widgets show, so the photo can be framed around them, but they ignore touches
   (`layersLocked`): every gesture frames the photo. The photo is optional, and can be removed
   again from the header: without one the canvas shows a dark transparency checkerboard and the
   image exports transparent, as a sticker.
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
minimum touch area; a see-through part of a layer, as the camera's view, lets the touch through
to what is under it), else the photo. A tap selects a layer or clears the selection. Layers snap
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

### Adding widgets

"Add element" opens a gallery, like the templates sheet: every widget the activity or period can
show, drawn live with the user's data and in the design's font, in sections (data, text, route,
charts, logo). Each widget is one tile, and its variants scroll sideways inside it, with a dot per
variant (ADR 009): each time notation (as a clock or in units, never rounded: distances keep
their two decimals and times their seconds), the pace with a colon or with marks, each date
format, a period's name in each format that writes it differently, the route solid, glowing,
dashed or dotted, splits without values, with their pace, or with their pace and change in
altitude, and the logo's name, monogram or both. Close data share a tile: the moving and elapsed
times, the average and highest heart rates, the elevation gain and highest altitude, the average
and weighted power. A tap adds the variant shown, centered. The variants of a widget are drawn at
one size so they compare, but for the date and the period's name, whose formats differ a lot in
length: they take a row of their own, and each format is as big as it fits. Variants are presets of the layer's fields: the template schema doesn't
change.

### Style

Few, visual options: color swatches (no free picker), five opacity presets, ten fonts named by
the style they give (Modern, Sport, Comic, Signature…) rather than by name. Shadows are automatic:
a widget whose color has a WCAG luminance above 0.1 casts a soft dark shadow so it reads over any
photo; darker colors go without, since a dark shadow would only blur them. Default designs use
one font for every widget; each starter template brings its own (ADR 007).

What a widget shows and how its value is written sit in its Format tab, after bold, italic, case
and alignment. Italic is offered in every font, so it adds variety without adding fonts: the four
that ship an italic (Inter, Barlow Condensed, Playfair Display, Space Mono) use it, and Skia
leans the letters of the rest, as sports graphics do; a slanted text measures the room its last
letter leans out, so it is grabbed and framed whole. First how the value is written, in one chip that shows the widget's own value written
the current way (never a made-up sample) and moves to the next way on each tap, like the
alignment button: a pace with a colon or with minute and second marks (`5:28`, `5'28"`, as on
sports watches; an hour or more reads `1h 05'30"`), a time as a clock, with units or rounded
(`1:40:30`, `1h 40min 30seg`, `1h 41min`; a period's total `280:40 h`, `280h 40min`, `281h`),
an activity's date in full, weekday, in words, short, in numbers, weekday and start time, or
start time, a distance with two, one or no decimals, a period's name in full, without the year,
short or in numbers. Then label and unit. The chip carries no icon: tapping it shows what it does.
Texts also get, as icon buttons next to bold and case, a backdrop that cycles like the story
editors' (none, a translucent box, a solid box), always in the color opposite to the text's,
which keeps its color, and letter spacing (normal, open, wide open), whose icon shows the
spacing chosen, as the alignment one does. The notation chips stay in Style although the gallery
offers each notation too: changing one there keeps the widget's place and colors. What changes a
widget's shape is picked only in the gallery: a route's line (Style keeps its width), the splits'
layout and the logo's artwork (Style keeps its tone). Charts put their bar option first (a dashed
average line), then their texts (axis labels, title).

Data widgets keep their metric's own label: there is no renaming them. Typing a label over a
widget written in capitals jumped between cases, and a free text next to a widget without its
label already says anything the user wants.

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
- **"Add element" as a list of names, with variants in Style:** options like the seven date
  formats or the splits' layout hid behind chips few would find, and the style panel kept growing.
- **Marks at a route's start and end:** they added nothing a viewer reads; removed (templates that
  had them still load, without them).
- **Shadow as a setting:** one more choice for something that has a right answer per color.
- **Swipe back that returns to the first step:** see above; react-native-screens can't cancel
  the native pop cleanly.
