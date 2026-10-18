# 006 - Exporting images

Date: 2026-10-18

## Context

A design ends up on Instagram, WhatsApp or the camera roll, either over the user's photo or as
a transparent sticker to lay over something else (a story they are already making). It has to
come out sharp, with no visible compression, and look exactly as it did in the editor. Everything
must work in Expo Go until the development build of milestone 5.

## Decision

- **Rendering:** the editor's own scene (`TemplateScene`), drawn off-screen with Skia's
  `drawAsImage` (`src/editor/export-scene.tsx`, `export-image.ts`). The canvas already works in
  export pixels and only scales down to the screen, so the export matches it by construction.
  The photo comes from its full-quality copy (up to 4096 px, ADR 004), placed by the same framing
  in proportions; exporting waits for that copy when it isn't ready yet, and prepares it again if
  it failed.
- **Size:** each format's canvas, 1080 px wide (1080 × 1920 for stories down to 1080 × 566):
  Instagram's own sizes, so no app rescales the image before recompressing it.
- **Encoding (`src/core/export.ts`):** over a photo, JPEG at quality 95 (about 0.5–1 MB, no
  visible loss; social apps recompress anyway). Without a photo, PNG with transparency.
- **Actions:** in the design step, "Export" turns the row of tiles under the canvas into Save,
  Share and Copy, and freezes the canvas, which shows exactly what is exported. The image is
  drawn once when exporting starts, so the actions are instant.
  - Save adds it to the photo library, asking only for permission to add photos
    (`expo-media-library`, write-only).
  - Share opens the system share sheet (`expo-sharing`), where Instagram, WhatsApp, AirDrop and
    "Save Image" already are. Apps may recompress what they get: WhatsApp turns images into
    JPEGs, so a sticker loses its transparency there (sent as a document it keeps it).
  - Copy puts it on the clipboard (`expo-clipboard`). Pasting a transparent PNG into an Instagram
    story makes it a sticker over the story; sharing it would make it the story's background.

## Open points

- The native permission text (`savePhotosPermission` in `app.json`) is in English; translate it
  with the app's languages when the development build arrives (milestone 5).
- Not tested on Android yet, like the rest of the native parts.

## Alternatives discarded

- **Instagram's own story sharing (`instagram-stories://`):** needs a Facebook app id and native
  code, and the share sheet plus Copy already cover it.
- **2160 px wide exports:** sharper outside social apps, but Instagram scales them back to 1080
  and they weigh four times as much.
- **PNG for photos too:** 3–5 MB for no visible gain.
- **A sheet with the actions:** it would hide the canvas; the row under it keeps the preview in
  sight and follows the editor's model (ADR 005).
- **Capturing the on-screen canvas:** it is drawn at screen size; the off-screen render draws at
  full size.
