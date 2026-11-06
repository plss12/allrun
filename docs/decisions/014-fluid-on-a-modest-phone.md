# 014 - Fluid on a modest phone

Date: 2026-11-05

## Context

The first test on a physical Android, a Samsung M32 (Helio G80, 1080 × 2400, 90 Hz), was slow all
over: moving a widget, resizing it, opening the galleries, scrolling the home screen. It was slow in
production mode too, and the iPhone had hidden it. Many users will have a phone like this one.

Everything here was measured on that phone, driving it with `adb` (`input swipe`, `dumpsys gfxinfo`,
`dumpsys meminfo`) for repeatable runs, changing one thing at a time. Median time per frame, at 90 Hz
(11 ms is the budget):

|                           | Before       | After |
| ------------------------- | ------------ | ----- |
| Moving a widget           | 57 ms        | 9 ms  |
| Scrolling the home screen | 40 ms        | 20 ms |
| Size slider               | not measured | 23 ms |
| Ending a gesture          | not measured | 66 ms |

What each frame cost, by removing it and measuring again:

- A widget's shadow is an image filter on a Skia layer, and a layer with no bounds is as big as the
  canvas: each text of a widget blurred the whole canvas on every frame of a gesture (53 ms → 10 ms
  with no shadows). Text shadows inside a paragraph cost little.
- On Android the whole window is drawn again on every frame of a scroll. A card's blurred
  `boxShadow`, invisible on the black background, took it from 35 ms to 22 ms, and a view's
  gradient and `overflow: 'hidden'` halved how many frames came out late.
- Android's blur of the top bar copies the screen on every frame: 40 ms → 35 ms.
- Laying out a widget's texts takes milliseconds, and was done on every render of the canvas.

## Decision

- **A gesture draws from textures** (`editor/gesture-textures.ts`). When it starts, what it leaves
  still goes once into textures of the UI thread (under what moves, over it, and the widget that
  moves), and each frame only puts them on screen. Until they are ready, and when it ends, the scene
  draws in vector; exporting never sees them. The scene's cost no longer depends on how many
  widgets there are. The moving widget's texture has twice the pixels it takes on screen, and
  mipmaps: at just as many its edges saw-toothed as it turned. A gesture frees its textures a moment
  after it ends, and only if no other has started: freeing the next one's turned the canvas black
  when moving widgets a lot.
- **Every widget is clipped to its box and the room for its shadow** (`layerClip`), which bounds its
  layers: what is left of the blur is what the widget takes. The tests already require that nothing
  draws past that room (`alphaOutside`).
- **Prepared widgets are kept** (`PreparedLayerCache`), by everything they depend on except where
  they are.
- **The icons are a font** (`assets/fonts/allrun-icons.otf`, from the same paths, with `npm run
icons`; needs uv), not a Skia canvas each: a canvas is a texture to create and compose, and a screen
  has dozens. The same shapes, there on the first frame, with no native code. A test compares the
  font with the paths, and the font was checked with fontTools: at most 0.5 units of 960 off center.
- **Long lists' cards** have no shadow and no clip, and their gradient is drawn once on a canvas
  (`CardGradient`), which also holds the card's route; `smallCardSurface` keeps a view's gradient for
  a few cards at a time. Lists mount what fills the screen, and let go of what is far: each card's
  canvas holds megabytes of GPU memory. What is near stays on screen (`removeClippedSubviews` off):
  on Android, taking a canvas off the screen destroys its surface, and tiles vanished and came back
  one by one on scrolling back. A summary's pages mount one at a time.
- **On Android the top bar's glass doesn't blur**: a darker translucent grey instead. iOS, where the
  system does it, still blurs.
- **Galleries are laid out a little at a time** (`startGalleryBuild`), in 8 ms steps, so the screen
  keeps responding, section by section; each variant once (a row of data was laid out twice). The
  editor lays its own out ahead of time and keeps it while it is open, so "+" shows it at once.
- **The heavy work around a photo waits**: its export copy starts 2.5 s after it is chosen, unless the
  user exports first, and the stock photos are decoded one per turn of the JavaScript thread.
- **A slider's thumb is drawn with Skia** (`SliderThumb`), not an animated view, which makes
  Reanimated commit the tree of the screen.

### In a release build (2026-11-06)

Measured on a release APK built in Ubuntu, compiled ahead of time as a store install is (`cmd package
compile -m speed-profile`) and on a second launch: a fresh install runs interpreted, and Android's
own shader cache starts empty, which made every number worse than a user sees. Traced with Perfetto
(`Record View#draw()`, `postAndWait`, `shader_compile`) and sampled with simpleperf.

- **Texts are pictures** (`editor/paragraph-picture.tsx`): Skia's `<Paragraph>` lays its paragraph
  out again on every draw, on the UI thread, while the JavaScript thread may paint the same one
  (`drawAsPicture` for a gesture's textures) or free it. The app closed once with a native crash in
  `ParagraphCmd::draw`. Each text is recorded once into an `SkPicture`, which can't change and which
  the UI thread keeps a reference to while it draws it. Opening the widget gallery drew in half the
  time.
- **A gallery tile is one canvas**: the card's gradient and its pages, which follow the pager on the
  UI thread through a shared value; before, two canvases a tile and one more for each page swiped.
- **The widget gallery's list** renders three rows first and then one row at a time, one screen ahead.
  A sheet of our own on Android, kept mounted, made every opening after the first instant, but it set
  the phones apart: undone (the user's rule: one app, the same on both, no native changes).
- **Skia's programs are compiled under the launch screen** (`editor/shader-warmup.tsx`): Skia has no
  persistent shader cache, and the first gallery of each run spent some 400 ms compiling. On a second
  launch, the first opening went from 830-1,110 ms of long frames (one of 372 ms) to 610-800 ms (at
  most 159 ms); the launch screen, which stays at least 1 s, hides it.
- **A gesture's textures draw one per frame**, not all at once at its start. Keeping their surfaces
  for the next gesture saved 20 ms of making one, but every drag left some 24 MB of the GPU's memory
  behind, never used again (measured over three editor sessions): each is still made and freed at once.

Tried and discarded: mounting a list's tiles one per frame (a run of 50 ms frames, worse), backing
tiles with a `SurfaceView` (2.7 s of long frames against 2.1), keeping only the visible page of each
summary (no change: the cost was each canvas's first draws on showing the tab).

Still open: starting a drag holds the UI thread about 40 ms. In that first touch the canvas is
drawn twice in vector, the whole scene, before its textures take over: the swaps are 5 ms, the rest is
the CPU going through the scene. Drawing the textures as soon as a widget is selected, and using them
once it moves, was tried and gave nothing measurable (40-50 ms still), with 19 MB of the GPU taken
while anything is selected: undone. It would need the selected scene drawn from textures too, which
risks the sharpness of the whole image while editing. Opening the Summaries tab held a frame of 500
ms: solved in the second round, below. `adb input swipe` sends only about 54 touches a second: a gesture's frame rate measured with it is
the injection's, not the app's.

### A second round in a release build (2026-11-06)

Measured the same way. Each change was kept only where it measured better and drew the same pixels:
screenshots before and after were compared pixel by pixel.

- **What hides without unmounting is never flattened** (`KeptMounted`, `collapsable={false}`). React
  Native leaves a plain view out of the native tree and gives its children to its parent; hiding or
  showing `KeptMounted` changed whether it was plain, and so moved its children from one native view
  to another. A Skia canvas so moved loses its surface and makes it again: every change of the
  home's tabs, both ways, held the UI thread 400-530 ms, and every change of the selection's tabs
  too. Now a change of tab takes 13-24 ms, and Designs or Stickers, once opened, show again at once.
  It costs 2.5 MB more of the GPU's memory, for the surfaces kept.
- **A summary card is one canvas**: its gradient and its pages' charts, which follow the pager on
  the UI thread, as a gallery's tiles do; the texts stay views in the pages, which say where the
  charts go. Summaries scroll at 19 ms a frame (23-25 before).
- **The tabs' capsule is drawn with Skia** (`GlassTabs`): an animated view made Reanimated commit the
  tree of the whole screen on every frame of its spring, a sixth of the UI thread on opening Designs.
  The first opening of Stickers went from 741 to 501 ms of long frames.

Measured and within the targets: opening the editor (frames of 44-110 ms, once Android's shader
cache has them), the color and "Aa" panels (140 and 75 ms in all), undo and redo, the export bar,
copying the image, typing (17 ms a key), and collages with real photos: choosing a layout (one frame
of 46 ms), putting a photo in a cell (35 ms), moving it in its cell (14 ms a frame); only opening the
photo grid from an empty cell reaches 105 ms, a sheet like the others (roadmap, step 2). Memory grows slowly, as
measured later over eight editor sessions with Designs and Stickers: about 7 MB of native memory a
session (174 to 230 MB; the whole app, 546 to 639 MB), part of it given back with the app in the
background. Over six sessions it had looked level. What keeps it is still to find (roadmap).

Tried and discarded:

- **The stock photos on the GPU ahead of time**, drawn once out of sight so that their textures stay
  in the UI thread's GPU context (which Skia never purges): the first Designs opening went from
  500-690 ms to about 380 ms, but the photos take over a second to decode after launch, too long to
  hold the launch screen; uploaded on the home screen, they made a frame of 100 ms there and took
  35 MB of the GPU's memory in every session.
- **Fewer rows kept around in the widget gallery** (`windowSize` 2): no measurable change on opening
  or scrolling, and closing went from 230 to 200 ms.

Still open, with what each costs:

- **The first opening of Designs** in each visit to the selection: one frame of 500-690 ms, the first
  draw of eleven thumbnails; half of it is putting their photos on the GPU (above).
- **The widget gallery**: its first opening in an editor session is 600-1,000 ms of frames of 35-80
  ms, each tile a canvas to create; closing it, by adding a widget or not, is a frame of about 210
  ms, as Android destroys the surfaces of the twenty-odd tiles mounted. A sheet kept mounted would
  avoid both: one of our own, the same on both phones, is planned (roadmap, step 2).
- **The size slider**: 18 ms a frame (dragging a widget, 9). Its thumb's own canvas costs 3-4 ms of
  each frame, measured by taking it away, and the rest is the widget's texture drawn at a size that
  changes on every touch. The thumb can't go on the editor's canvas: its top is outside it.
- **Opening a photo**: a frame of 110-150 ms when its 2,048 px copy goes up to the GPU (see decoding
  photos natively, below; approved for the native milestone, roadmap step 6).

`adjustsFontSizeToFit` is avoided where a text must keep its size or stay centered: on Android it
shrinks the text even if it fits (11 % measured) and leaves it up and to the left of the box measured
before shrinking it. Sizes are chosen by the text's length, the same on both phones.

## Not done yet

- **Decoding photos natively, straight into a GPU buffer** (ADR 004) needs a native module. In a
  release build, moving a photo already keeps its frames under 20 ms but two; opening one in the
  editor has frames of up to 140 ms, mostly creating its views.
- **Reanimated's `ANDROID_SYNCHRONOUSLY_UPDATE_UI_PROPS` and `IOS_SYNCHRONOUSLY_UPDATE_UI_PROPS`**,
  which update an animated view without a commit, need a native build as well.
- **The size slider**: see the second round above.
- **A gallery's other pages** are still laid out before they are swiped to; only their drawings wait.
  Laying them out later needs to know if they have anything to show, which is what decides the dots.

## Alternatives discarded

- **`expo-linear-gradient`** for the cards: slower than React Native's own gradient (36 ms).
- **Flat cards**: the fastest (18 ms), but the cards lit from above are part of the app's look.
- **Dropping the shadows**: they are what makes a widget readable over a photo.
- **Dropping the blur on the iPhone too**: there it costs little, and the system does it.
