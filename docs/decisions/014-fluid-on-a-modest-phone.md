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

`adjustsFontSizeToFit` is avoided where a text must keep its size or stay centered: on Android it
shrinks the text even if it fits (11 % measured) and leaves it up and to the left of the box measured
before shrinking it. Sizes are chosen by the text's length, the same on both phones.

## Not done yet

- **Decoding photos natively, straight into a GPU buffer** (ADR 004) needs a development build, and
  so does measuring anything with photos on Android: Expo Go refuses them there.
- **Reanimated's `ANDROID_SYNCHRONOUSLY_UPDATE_UI_PROPS` and `IOS_SYNCHRONOUSLY_UPDATE_UI_PROPS`**,
  which update an animated view without a commit, need a native build as well.
- **The size slider** stays at 23 ms, whatever is on screen: neither the canvas, nor the thumb, nor the
  other controls explain it. The cause is still unknown.
- **A gallery's other pages** are still laid out before they are swiped to; only their canvases wait.
  Laying them out later needs to know if they have anything to show, which is what decides the dots.

## Alternatives discarded

- **`expo-linear-gradient`** for the cards: slower than React Native's own gradient (36 ms).
- **Flat cards**: the fastest (18 ms), but the cards lit from above are part of the app's look.
- **Dropping the shadows**: they are what makes a widget readable over a photo.
- **Dropping the blur on the iPhone too**: there it costs little, and the system does it.
