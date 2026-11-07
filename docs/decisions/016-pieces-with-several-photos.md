# 016 - Pieces with several photos

Date: 2026-11-07

Status: accepted. Extends the image layer of ADR 009 and the designs' slots of ADR 007. Used by the slide viewer, the photobooth's strip, the chat with two photos and the margins' page.

## Context

Until now a picture's widget held one photo: a picture stuck on, an instant photo, or a photo in its
holder (a film frame, a negative, the camera, the crop screen). The Slides design, an old slide
viewer with three photos and a datum in each, needs three photos in one piece, and so will the
Photobooth's strip. The owner's rule is that a holder, its photos and its data are one piece that
moves, scales and turns as a widget (editor-photos rule), and that every piece of a design can also be
added alone from the widget gallery.

Three slides as three pieces stacked would have fitted the model as it was, but they would not have
moved as one, and the Photobooth would have needed the same workaround again.

## Decision

- **A picture's widget has windows** (`windowCount` in `core/image-layer.ts`): one for every holder
  but the slide viewer, which has three. The first window's photo stays in `image`, as before; the
  others go in the optional `extraImages`, in order. An optional field keeps every saved design
  readable, with no new template version.
- **Every helper of slots works by window**: `layerPictures` lists them (`SAMPLE_IMAGE` for one with
  none yet); `fillSlots` fills them in order; `withEmptySlots` saves them all empty; `isEmptyWindow` and
  `firstEmptyWindow` say which one waits for a photo; `withoutPicture` empties those of a photo that
  can't be read; `setLayerImage` changes one window and leaves the others. Each window counts towards
  the six pictures a design takes (`imageCount`), since each is decoded.
- **A touch knows its window**: the canvas passes where the tap was (canvas pixels), `layerPoint`
  takes it into the layer (its place, turn and scale undone) and `windowAt` names the slide under
  it. A tap on an empty slide, or a second tap on a full one, changes that slide's photo. The
  widget's own button, which knows no window, changes the first empty one, or else the first.
- **Several photos at once**: the editor's grid marks photos in order with a numbered ring, as
  Instagram does, and a button adds them (`choose` with `max` in `use-photo-picker.tsx`): adding a
  slide viewer asks for its three, and a tap on an empty slide for those still empty, from that one
  on. Collages will use it later (the owner's call). The grid also offers "No photo" when a picture is
  added: it comes as a slot with the sign to fill it.
- **A saved design keeps every picture as an empty slot**, a picture stuck on and an instant photo
  too (the owner's choice), so whoever uses it puts their own photos in.
- **The scene keeps a layer laid out while all its windows' photos are the same**
  (`PreparedLayerCache` compares them all).

## The slide viewer

- `slidesBox`: three slides 3:2, one under another on a black body, each with the viewer's tab
  cutting into its left edge, always at its middle (the owner's correction).
- The look is the owner's reference: the photo stays sharp, and it is the viewer's gate, its edge
  and its tabs, that comes in out of focus, as a projector's mask (a `BlurMask` over one black path
  with the slides cut in it; a black per slide overlapped its neighbours', and the even-odd rule cut
  holes there), with a faint shade along it inside. Each slide writes one of the three data (the
  activity's card data, the period's totals) in Unbounded, a pale yellow, right of its middle.

## The photobooth's strip

- `boothBox`: three photos on black paper, a longer foot with the date by hand, and a piece of paper
  tape over its top with the main datum, sticking out above it. In its design the strip leans 3°
  and the tape stays level, over the canvas's photo as the Polaroid, which the user sets by hand (the owner's
  reference and choice).

## The chat

- `chatBox`: the Message designs, three loose widgets before (the date, the photo, the message),
  ran into each other on another format, so they became one piece, with one photo (`chat`) or two
  (`chatPair`): the date over the rounded photos and the chat widget's own message under them,
  shrunk to its band and right-aligned with them; on a wide canvas, side by side. The piece's
  layout depends on the canvas, so `windowAt` takes it.

## Photos of widgets and of the canvas, apart

Later the same day the owner settled it (after trying a first photo of a widget that became the
canvas's, and the photos going between the widgets' slots and a collage's cells): the photos of the
widgets stay in them and leave with them, and the canvas's photo and the cells' stay where they are.
A design's slots come empty; only the camera and the crop screen, as big as the canvas, use the
canvas's photo.

## Rejected

- **Three pieces stacked**: no change to the model, but they don't move as one, and the Photobooth
  would repeat the workaround.
- **An array of photos replacing `image`**: cleaner on paper, but every saved design and every piece
  of code reading `image` would change at once, with a new template version.
- **Blurring the photo towards its edges**: the first mock-ups did, and the owner pointed out that
  the reference keeps the photo sharp and blurs the gate.
