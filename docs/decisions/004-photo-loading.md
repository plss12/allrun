# 004 - Loading photos into the canvas

Date: 2026-10-16

## Context

The canvas is drawn with Skia, which decodes JPEG, PNG and WebP but not HEIC/HEIF, the default
format of iPhone cameras. Photos are also large (12 MP is common, 48 MP on Pro models: about
200 MB once decoded). This is a photo app, so loading must be fast and output quality must never
drop.

Tried and rejected after testing on an iPhone:

1. **Re-encode the full photo before showing it:** HEIC photos took a couple of seconds to appear.
2. **System viewer (`expo-image`) under the Skia canvas while Skia's copy is prepared:** the
   canvas stayed black while the viewer decoded the photo, and flashed black when Skia took over
   (it needs a frame or two to upload a large image to the GPU). It also meant two engines drawing
   the same photo, which gestures would have to keep in sync.

## Decision

Skia alone draws the photo, from two copies (`src/editor/photo-plan.ts`):

- **Editor copy**, at most 2048 px (JPEG 0.92 when re-encoded): sharper than the on-screen canvas
  even on the largest phones, and quick to prepare. The canvas shows its placeholder and a spinner
  meanwhile.
- **Export copy**, at most 4096 px (JPEG quality 1 when re-encoded), prepared in the background
  while the user edits, for exporting.

A copy is the original file when it is already decodable and small enough; otherwise
`expo-image-manipulator` re-encodes it once with the platform decoder, which reads HEIC. The
framing is stored as proportions of the photo (`src/core/photo-framing.ts`), so both copies give
the same picture.

## Future: native decoding (with the development build, milestone 5)

Once the app has a development build (needed anyway for the depth effect), try a small native
module that decodes photos with the platform (ImageIO on iOS, ImageDecoder on Android; both read
HEIC in hardware) straight into a GPU buffer handed to Skia
(`Skia.Image.MakeImageFromNativeBuffer`). It skips re-encoding and writing a file, so it is the
fastest option. Estimated effort: one or two days including testing on both platforms. Keep it
only if it is clearly faster on device.

## Alternatives discarded

- **Custom Skia build with an ImageIO-based decoder:** a fork of `react-native-skia` and long Skia
  builds to maintain for a single format.
- **Another stack** (native Swift/Kotlin, Flutter, React Native without Skia): either two apps,
  a rewrite, or less control over text, vectors and export resolution.
