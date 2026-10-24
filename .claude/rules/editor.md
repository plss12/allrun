---
paths:
  - 'src/editor/**'
  - 'src/app/editor.tsx'
  - 'src/core/{editor-document,history,layer-transform,photo-framing,template-edit,starter-templates,default-layout}*.ts'
---

# Editor

El rediseño (ADR 009) sustituirá, a medida que se construya (R3 y R4), varias reglas de aquí: el editor en dos pasos, la foto que siempre cubre el marco, el deshacer solo de widgets, los colores en páginas fijas y las plantillas de AllRun. Cada R actualiza aquí lo que cambie. El modelo completo de interacción (pasos, deshacer, gestos, controles, estilo) está en `docs/decisions/005-editor-interaction.md`.

- Editor en dos pasos sobre el mismo lienzo (decisión de producto): primero foto (opcional: sin foto se ve un damero y la imagen sale transparente, como sticker), formato y encuadre, con los widgets visibles pero bloqueados (`layersLocked`); luego el diseño, donde la foto se puede encuadrar pero no cambiar, y el formato queda fijo. Volver atrás conserva los widgets; cambiar de formato con widgets editados avisa y empieza un diseño nuevo, porque recolocados en otra proporción se amontonan.
- Deshacer, rehacer y «Empezar de nuevo» solo afectan a los widgets: un `EditorLayers` (`core/editor-document.ts`; `null` es el diseño por defecto del formato) dentro de un `History` (`core/history.ts`), con un paso por gesto o cambio. El formato y el encuadre de la foto se eligen antes y van aparte, fuera del historial (decisión de producto).
- Durante un gesto el valor vive en un _shared value_ en el hilo de UI y solo se confirma al soltar (`scheduleOnRN`): un `setState` por gesto, no por fotograma. La capa arrastrada se dibuja desde el _shared value_ solo mientras se arrastra; empezar y terminar el arrastre va en la misma actualización de React que la selección o el commit, para que nunca se vea un fotograma con una transformación vieja. Medidas, toques e imantado salen de `prepareLayers` (`editor/template-scene.tsx`) y `core/layer-transform.ts`.
- La foto siempre cubre el marco, también girada: nunca quedan esquinas vacías (decisión de producto; Instagram sí las deja y es difícil volver a encuadrar).
- Fotos: Skia dibuja una copia de editor (≤ 2048 px) y se prepara en segundo plano una de exportación (≤ 4096 px, calidad máxima); el encuadre va en proporciones. Detalle y alternativas en `docs/decisions/004-photo-loading.md`.
- Exportar: la misma escena del lienzo dibujada fuera de pantalla (`drawAsImage`) a 1080 px de ancho; JPEG 95 con foto, PNG transparente sin ella (sticker). Guardar, compartir y copiar desde la fila bajo el lienzo; copiar es como el sticker llega a una historia de Instagram. Ver `docs/decisions/006-export.md`.
- Plantillas de AllRun (ADR 007): cada una es una receta que coloca los widgets para cualquier formato y dato; `editor/starter-templates-scene.test.tsx` mide con las fuentes reales que nada se salga del lienzo ni se solape. Los textos con `maxWidth` no hacen salto de línea: encogen. Los widgets nuevos usan la fuente mayoritaria del diseño (`designFont`), salvo los mixtos: cada uno trae la letra que le pega (`blockLettering`).

## Memoria nativa de Skia

Cada párrafo de Skia declara 1 MB a Hermes, que tarda en liberarlo: abrir la galería unas veces cerraba la app. Por eso:

- Todo párrafo se construye con `finishParagraph` (`editor/paragraph-arena.ts`). El builder se deja al recolector: el nativo solo tiene `build`, `reset`, `addText`, `addPlaceholder`, `pushStyle` y `pop` (el de CanvasKit de los tests tiene `dispose`, y llamarlo rompió la app en el iPhone; `gallery-memory.test.tsx` imita al nativo).
- Lo que solo se mide se libera en el acto con `discardParagraph`.
- Lo que se maqueta en lote (la galería: `buildGallery`) va en `inParagraphArena` y se libera con `disposeLater` cuando deja de mostrarse: Skia lo pinta desde una grabación en el hilo de UI, así que se libera después de que el lienzo deje de dibujarlo.
- Las fuentes de Skia se cargan una vez por sesión (`loadEditorFonts` en `editor/fonts.ts`, detrás de la pantalla de carga): `useEditorFonts` las devuelve al instante si ya están.
