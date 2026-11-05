---
paths:
  - 'src/editor/{paragraph-arena,layer-sheet,widget-gallery,design-gallery,sticker-gallery,gallery-memory}*'
  - 'src/editor/fonts*'
---

# Memoria nativa de Skia

Cada párrafo de Skia declara 1 MB a Hermes, que tarda en liberarlo: abrir la galería unas veces cerraba la app. Por eso:

- Todo párrafo se construye con `finishParagraph` (`editor/paragraph-arena.ts`). El builder se deja al recolector: el nativo solo tiene `build`, `reset`, `addText`, `addPlaceholder`, `pushStyle` y `pop` (el de CanvasKit de los tests tiene `dispose`, y llamarlo rompió la app en el iPhone; `gallery-memory.test.tsx` imita al nativo).
- Lo que solo se mide se libera en el acto con `discardParagraph`.
- Lo que se maqueta en lote (la galería: `startGalleryBuild`, `buildGallery`) va en `inParagraphArena` y se libera con `disposeLater` cuando deja de mostrarse: Skia lo pinta desde una grabación en el hilo de UI, así que se libera después de que el lienzo deje de dibujarlo.
- Las fuentes de Skia se cargan una vez por sesión (`loadEditorFonts` en `editor/fonts.ts`, detrás de la pantalla de carga): `useEditorFonts` las devuelve al instante si ya están.
