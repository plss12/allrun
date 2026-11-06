# 015 - One sheet of our own

Date: 2026-11-06

Status: accepted. Replaces React Native's `Modal` in the app's six sheets: the widget gallery ("+"),
Designs, choosing an activity or a period, a list of phrases (verses, quotes, chat), the photo grid
inside the editor and the phrases of a Sticker.

## Context

The sheets were React Native's `Modal` with `presentationStyle="pageSheet"`: a card on iOS and the
whole screen on Android, against the rule that the app looks the same on every phone (ADR 013). On
Android the `Modal` is a window of its own, and it also cost the most of anything left in ADR 014:
its content was mounted on each opening and destroyed on each closing, so the widget gallery spent
0.6-1 s of long frames on every first "+" of an editor session and a frame of about 210 ms on
closing (Android destroying the surfaces of some twenty tiles). The keyboard and the photo library
also had to wait for it: iOS opens neither over a native sheet, and on Android a field focused while
the sheet's window closed got no keyboard.

## Decision

- **A tall card, the same on both phones** (`ui/sheet.tsx`, the owner's choice): it rises from the
  bottom to 10 pt under the safe area, with round top corners and a grabber, over the screen dimmed
  behind it. It closes by dragging it down from its header, or from its list once scrolled to its
  top; by tapping outside it; with its close button; and with Android's back.
- **A host per screen** (`SheetHost`, in the editor and the selection screen), over everything the
  screen draws: a `Sheet` anywhere in the screen's tree draws itself there, as a modal could. Not one
  host for the app: on iOS a screen presented as a modal (the editor) goes over anything the root
  draws. While a sheet is open, the screen under it is hidden from screen readers.
- **It moves on React Native's native animation driver**, the drags too (`Animated.event` from
  gesture-handler's pan with `useAnimated`): neither commits the screen's tree on each frame, which
  an animated view of Reanimated does (ADR 014).
- **While it moves, the card is drawn into a texture of its own** (`renderToHardwareTextureAndroid`)
  and each frame only moves the texture: drawn as views, a card full of canvases was drawn again on
  each frame, 21 ms of the GPU a frame on a Samsung M32 while dragging it; with the texture, 11 ms.
  The card doesn't clip what it holds (`overflow: 'hidden'` with round corners costs each frame on
  Android): its frame rounds its own top (`SheetFrame`).
- **Lists drag the sheet once at their top**: a sheet's list is a `SheetScrollView` (as a
  `ScrollView` or a list's `renderScrollComponent`), gesture-handler's scroll view working together
  with the sheet's drag, with no bounce or stretch of its own. Outside a sheet it is React Native's.
  Each header and each list makes its own drag, on values the card shares, as a gesture goes on one
  view only and a sheet can hold a list over another.
- **The widget gallery stays mounted** while the editor is open (`keepMounted`): every "+" after the
  first shows it at once, where it was.
- **What a sheet starts** (the keyboard for a new text, the photo library) starts at once: no native
  window is in the way any more.

Measured on the Samsung M32, in a release build:

|                                | `Modal`                   | Own sheet                    |
| ------------------------------ | ------------------------- | ---------------------------- |
| First "+" of an editor session | 650-990 ms of long frames | 460-620 ms, none over 70 ms  |
| Every "+" after it             | as the first              | 0-32 ms                      |
| Closing the widget gallery     | a frame of about 210 ms   | no frame over 30 ms          |
| Dragging the sheet             | (iOS only)                | 90 frames a second, 12% late |

Memory after eight editor sessions is the same as with the `Modal` (native heap 237 MB against 230,
the whole app 641 MB against 639).

## Alternatives discarded

- **Keeping the `Modal`, or keeping it mounted on Android only**: the phones differed, and the first
  was the slowest thing left; an Android-only sheet was tried and undone (one app, ADR 014).
- **A sheet library** (`@gorhom/bottom-sheet`): it animates with Reanimated's animated styles, which
  commit the screen's tree on every frame, and adds a dependency for what a short component does.
- **Reanimated for the movement**: the same commits; its synchronous props (roadmap, step 6) would
  avoid them, but need a native build.
- **One host at the app's root**: hidden under the editor on iOS, which is a native modal.
