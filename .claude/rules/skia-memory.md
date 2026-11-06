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
- Los textos de las escenas se dibujan como pictures (`ParagraphPicture`, `editor/paragraph-picture.tsx`), nunca con el `<Paragraph>` de Skia: este vuelve a maquetar el párrafo en cada dibujo, en el hilo de UI, mientras el de JavaScript puede pintarlo (`drawAsPicture`) o liberarlo, y la app se cerró con un fallo nativo en `ParagraphCmd::draw`. La picture se graba una vez por párrafo y ancho, y se libera con él en la arena; el lienzo guarda su propia referencia mientras la dibuja.
- Skia no guarda sus shaders entre arranques: `ShaderWarmup` los compila bajo la pantalla de carga. Si un widget usa un efecto nuevo (otra clase de filtro, de degradado o de muestreo), añádelo allí.
- Las fuentes de Skia se cargan una vez por sesión (`loadEditorFonts` en `editor/fonts.ts`, detrás de la pantalla de carga): `useEditorFonts` las devuelve al instante si ya están.
