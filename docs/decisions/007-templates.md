# 007 - Templates

Date: 2026-10-18

Status: agreed, not built yet (milestone 3d).

## Context

Designing from scratch every time is slow, and a good design deserves to be reused with the next
activity or period. Two needs: ready-made designs that look good from the first moment, and
keeping the user's own. Widgets sit at positions relative to the canvas and are bound to data
(they show whatever activity or summary is open), so a design can be reused as long as the
proportions of the canvas don't change much (see ADR 005 on why format changes pile layouts up).

## Decision

### Two kinds

- **AllRun templates (built in):** recipes, like today's default layout (`core/default-layout.ts`):
  a function of the data and the format that places every widget for that format, so each works
  in the five formats and with any activity or summary. Each has its own font and personality.
  The first set, for activities and summaries alike:
  - **Sport:** today's default design (Barlow Condensed).
  - **Poster:** huge numbers in Archivo Black, the data as the star.
  - **Classic:** Playfair Display, elegant, fewer data and more space.
  - **Minimal:** small Inter, everything grouped in a corner so the photo leads.

  Adding more later is cheap: one more recipe.
- **The user's templates:** the design on screen, saved as is (a `Template`: format plus layers,
  validated with Zod). Reused with other activities or periods, its widgets fill in with the new
  data. **No names:** a template is recognised by its thumbnail; asking for a name adds a step,
  and Android has no native text prompt.

### Where

In the design step, a third quick action, **Templates**, next to "Add element" and "Text". It
opens a sheet of **live thumbnails**: each template drawn with the user's own data and photo, so
they see the result before choosing. On top, the user's templates with a "Save current design"
button; below, AllRun's. Choosing one replaces the widgets as one undoable step. The user's
templates can be deleted.

### Formats

A user's template belongs to the format it was made in: the sheet only shows the user's templates
of the current format. AllRun's recipes fit every format.

### Storage

Local JSON (validated on read) behind a small store interface, so that when real login arrives
the user's templates sync to Supabase (a firm requirement, ADR 003) without touching the editor.

## Alternatives discarded

- **Showing every saved template in any format:** a story layout in 1.91:1 piles up and looks
  broken.
- **Named templates:** an extra step for little gain; can come later if lists grow.
- **Static preview images for the built-in templates:** they wouldn't show the user's own photo
  and data.
