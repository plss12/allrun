---
paths:
  - 'src/editor/**'
  - 'src/app/editor.tsx'
  - 'src/core/{editor-document,history,layer-transform,photo-framing,template-edit,starter-templates,default-layout}*.ts'
---

# Editor

El rediseño (ADR 009) sustituye, a medida que se construye (R3 y R4), varias reglas del ADR 005: R3a ya quitó los dos pasos y el deshacer solo de widgets; quedan la foto que siempre cubre el marco (R3b), los colores en páginas fijas (R3c) y las plantillas de AllRun (R4). Cada R actualiza aquí lo que cambie; el ADR 010 lo recogerá al cerrar R3. Gestos, estilo y escritura siguen en `docs/decisions/005-editor-interaction.md`.

- Editor en un solo paso y a pantalla completa (ADR 009): modal sin cabecera nativa, el lienzo llena el área segura y los controles flotan sobre él. Arriba a la izquierda, cerrar y debajo, en columna, deshacer, rehacer y «Empezar de nuevo»; arriba a la derecha, en fila, añadir imagen, profundidad y la flecha que pliega la columna de debajo (Collages, Diseños, Proporción con el menú de formatos, Actividad), que empieza plegada y nombra sus botones unos segundos al abrirse. El icono del deporte de Actividad es vectorial, como en toda la app (`SportGlyph`). Todos los botones de las esquinas miden lo mismo (`ROUND_BUTTON_SIZE`). Lo que se oculta sin desmontarse va en `KeptMounted` (opacidad 0 y sin toques): con la nueva arquitectura, `display: 'none'` también quita la vista nativa, y al volver se recargaba el icono del deporte. Abajo, «+» y «Aa» a la izquierda y Exportar en rojo a la derecha. Los botones y paneles flotantes llevan la superficie de las tarjetas de la galería (`floatingSurface`), no negro, para destacar sobre el fondo y sobre la foto. Cerrar con foto o cambios pregunta, y al confirmar sigue con `repeat()` de `usePreventRemove` tras dejar de prevenir (volver a despachar la acción ya no basta en el SDK 58). Las herramientas del widget seleccionado, las de la foto (un toque en ella) y las de exportar van en un panel flotante abajo, o arriba (bajo la columna de la izquierda) si el widget está en la mitad inferior; mientras se arrastra un widget o se escribe, los controles se apartan. Sin foto, el lienzo muestra el damero con «Elegir foto» en medio (la imagen sale transparente, como sticker). Lo que aún no funciona avisa con «Llegará pronto» (`editor/notice.tsx`).
- Deshacer, rehacer y «Empezar de nuevo» cubren todo el diseño: un `EditorDesign` (formato, encuadre y widgets; `layers: null` es el diseño por defecto del formato) en un `History` (`core/history.ts`), un paso por gesto o cambio. Cambiar de formato conserva los widgets en sus posiciones relativas, sin avisar (se deshace). «Empezar de nuevo» lo devuelve todo como al abrir salvo el formato y la foto, que no está en el historial.
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
