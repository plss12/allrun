---
paths:
  - 'src/app/editor.tsx'
  - 'src/editor/{editor-top-bar,editor-side-menu,editor-layout,widget-column,round-button,dock,notice,style-panel,typing-overlay,format-menu,collage-menu,data-sheet,export-bar,action-tile,slider-thumb,choice-list}*'
  - 'src/core/font-change*'
---

# Editor: pantalla y controles

Modelo: un solo paso a pantalla completa (ADR 009; el ADR 011 recoge lo que cambió de los ADR 005 y 007). Gestos, añadir widgets y escritura siguen en `docs/decisions/005-editor-interaction.md`. El resto del editor, en `editor-canvas.md`, `editor-history.md`, `editor-color.md` y `editor-photos.md`.

## Entrada

- Se llega desde la selección (`app/select.tsx`): pestañas Foto, Diseños y Stickers. Una foto abre el editor con ella y el diseño vacío, solo con la marca de agua (`emptyLayout`); la casilla «Sin foto», sin ella. El parámetro `photo` es su id en la fototeca, y el fichero se lee ya dentro del editor, con el indicador sobre el lienzo (una foto solo en iCloud se descarga antes).
- Dentro del editor, toda foto se elige con la misma cuadrícula en una hoja (`usePhotoPicker`), nunca con el selector del sistema.
- Modal sin cabecera nativa: el lienzo llena el área segura y los controles flotan sobre él.
- Cerrar con cambios pregunta (la foto sola no: sigue en la fototeca, y se vuelve a la selección), y al confirmar sigue con `repeat()` de `usePreventRemove` tras dejar de prevenir (volver a despachar la acción ya no basta en el SDK 58).

## Botones

- Arriba a la izquierda, cerrar y debajo, en columna, deshacer, rehacer y «Empezar de nuevo».
- Arriba a la derecha, en fila, lo que cambia el diseño y se deshace (profundidad, Collages y Diseños; las fotos se añaden con el widget, decisión del usuario) y la flecha que pliega la columna de debajo: los ajustes (Proporción con el menú de formatos, que, como el de collages, se queda abierto al elegir hasta que el usuario lo cierra (decisión del usuario), la unidad «KM»/«MI» y el idioma «ES»/«EN» de los widgets, que cambian con un toque, y Actividad), que empieza plegada y nombra sus botones unos segundos al abrirse (decisión del usuario). El icono del deporte de Actividad es `SportGlyph`.
- Abajo, simétrica (decisión del usuario): a la izquierda, la foto (abre sus herramientas, como un toque en ella, y sin foto, directamente el selector, decisión del usuario; nunca un botón sobre el lienzo, que impedía mover widgets) y «Aa»; en el centro, «+», más ancho porque es lo principal; a la derecha, Guardar, solo con su icono, que guarda directamente en la fototeca (`saveNow`; también sigue en la barra de exportar), y Exportar en rojo, solo con su icono. La fila cabe en un Android pequeño (360 pt; `editor/editor-layout.ts`, con test).
- Todos los botones de las esquinas miden lo mismo (`ROUND_BUTTON_SIZE`), y los de una fila, la misma altura: lo que conviene destacar va más ancho o en otro color (Exportar en rojo), nunca más alto (decisión del usuario).
- Lo que se oculta sin desmontarse va en `KeptMounted` (opacidad 0 y sin toques): con la nueva arquitectura, `display: 'none'` también quita la vista nativa. Lleva `collapsable={false}`: sin él, al ocultarse o mostrarse pasaba a ser aplanable o no, React Native movía sus hijos de vista nativa, y cada lienzo movido rehacía su superficie (400-530 ms por cambio de pestaña en el inicio, ADR 014). Cualquier vista que cambie de opacidad, `pointerEvents` o accesibilidad con lienzos dentro, igual.
- Botones y paneles flotantes llevan la superficie de las tarjetas de la galería (`floatingSurface`), no negro, para destacar sobre el fondo y sobre la foto; su filo es una sombra interior y no un borde (un borde translúcido dejaba ver el fondo, más oscuro que la parte alta del degradado, y los botones parecían cortados arriba), y lo redondo lleva esquina circular (`roundSurface`).
- Mientras se arrastra un widget o se escribe, los controles se apartan.
- Lo que aún no funciona avisa con «Llegará pronto» (`editor/notice.tsx`); los avisos salen grandes en medio de la pantalla, porque arriba apenas se veían (decisión del usuario).

## Columna de un widget seleccionado

`editor/widget-column.tsx` ocupa el sitio de la columna de la derecha, y solo salen las herramientas que aplican (`widgetTools` en `editor/style-panel.tsx`):

- **Tamaño:** un deslizador vertical a su lado, logarítmico (`sliderOfScale`), que mide lo que la columna (decisión del usuario: que no acabe a mitad de un botón). El lienzo dibuja el widget desde un _shared value_ mientras se arrastra y lo confirma al soltar, en un paso.
- **Color, siempre el segundo** en todos los widgets (decisión del usuario): el menú de color, con el fondo del texto debajo; en el logo, sus tres tonos y la opacidad; en una foto del usuario, sus esquinas y la opacidad, porque su marco se elige en la galería (decisión del usuario); en una Polaroid o un soporte, solo la opacidad; en las réplicas de apps, solo la opacidad.
- **«Aa»** (fuentes y formato; en una ruta, el grosor) o, en una foto, **«Cambiar foto»**, con el icono de las herramientas de la foto.
- **«…»:** duplicar, delante, detrás, borrar y, en los textos, versículos, citas y frases, editar (decisión del usuario).
- En «Aa», negrita y mayúsculas muestran lo que se dibuja (decisión del usuario): una fuente sin negrita propia la bloquea, activada si ya es gruesa (Bangers, Permanent Marker, Anton, Bowlby One SC, Rubik Glitch) y desactivada si no (Graduate, Sacramento; `looksBold`), y una de solo mayúsculas (Bangers, Bowlby One SC, Graduate, Permanent Marker, las tres últimas con versalitas) escribe siempre en mayúsculas y bloquea la opción activada (`writesInCapitals` en `core/template.ts`).
- Las opciones de «Aa» y color, las herramientas de la foto y las de exportar van siempre en un panel abajo (decisión del usuario). Si el panel de un widget lo taparía, el lienzo entero sube lo justo para que se vea encima (`liftToClear`) y vuelve al cerrarlo: el widget sigue sobre su parte de la foto, donde se juzgan su color y su fondo, y el diseño no cambia.

## Toques

- Teclado de un texto libre en Android (`TypingOverlay`, `KEYBOARD_CHECK_MS`): el campo empezaba sin teclado útil. Desde la galería pide el teclado con la hoja aún cerrándose y no salía; desde el botón de texto, o al editar uno, sale pero el campo pierde el foco al apartarse los controles y lo escrito no llega. 500 ms después, un campo sin foco lo pide otra vez, y uno con foco sin teclado empezado a salir (su evento de mostrarse, no `Keyboard.isVisible()`, que en el iPhone llegaba tarde y lo cerraba y abría) también. Con las hojas del `Modal`, desde la galería además pedía el teclado con la ventana de la hoja aún encima; la hoja propia (ADR 015) ya no tiene ventana.
- Un segundo toque en un widget ya seleccionado lo edita, como su botón «Editar»: un texto libre abre el teclado; un versículo, una cita o un mensaje de chat, su lista con sus palabras marcadas (`editor/choice-list.tsx`, la misma de la galería), y la elegida las cambia en su sitio, con su tamaño y estilo, en un paso (`setChosenWords`); una foto del usuario abre la fototeca y la cambia, con su marco, sitio y tamaño (`setLayerImage`).
- Mientras un widget tape todo el lienzo, sea cual sea (`layerCoversCanvas`: la Cámara a su tamaño, una foto muy ampliada), un segundo toque lo suelta, porque si no, no se podría soltar; su acción sigue en su botón, y al reducirlo vuelve a editarse con un segundo toque (decisión del usuario).
- Un toque en la foto, o en el lienzo sin foto, abre sus herramientas, en este orden (decisión del usuario): quitar, cambiar o elegir foto, «Restablecer» (vuelve a su posición inicial, centrada, cubriendo y sin giro; se llamaba «Cubrir», y no era eso: decisión del usuario) y «Fondo», que abre el menú de color con «Auto» y «Transparente» delante. Un segundo toque en la foto va directo a cambiarla (decisión del usuario; sus herramientas se cierran con «Listo»; en un hueco de collage, la de ese hueco, y con el color del fondo abierto, lo cierra).
- Sin foto, el lienzo muestra el damero con «Elegir foto» en medio (la imagen sale transparente, como sticker).

## Hojas y barra de exportar

- Toda hoja es la propia de la app (`Sheet` en `ui/sheet.tsx`, ADR 015), nunca el `Modal` de React Native: una tarjeta alta, igual en los dos teléfonos, que se cierra arrastrándola hacia abajo, tocando fuera, con su botón o con volver en Android (decisiones del usuario). Va dentro del `SheetHost` de su pantalla (el editor y la selección), su contenido en un `SheetFrame`, y su lista vertical es un `SheetScrollView` (o `renderScrollComponent`: `SheetScrollView` en una `FlashList`, `renderSheetScroll` en una `FlatList` o `SectionList`), que arrastra la hoja una vez arriba del todo. Se mueve con el driver nativo de `Animated`, no con Reanimated, y mientras se mueve se dibuja como una textura (`renderToHardwareTextureAndroid`); la tarjeta no recorta lo que lleva (`overflow: hidden` con esquinas redondas cuesta cada fotograma en Android).
- Cambiar de actividad o de periodo (ADR 011): el botón Actividad (Periodo en un resumen) abre una hoja con las tarjetas del inicio (`editor/data-sheet.tsx`, que aceptan `onPress`/`onChoose`), y la elegida rellena el mismo diseño: el editor la carga sin desmontar el espacio de trabajo (`loadEditorData` y `onSwitch` en `app/editor.tsx`), con un indicador sobre el lienzo, así que diseño, historial y fotos se quedan; un fallo avisa y deja la de antes. Los widgets sin datos para ella se ocultan sin borrarse (`prepareLayers` los deja fuera) y vuelven con datos que los tengan. No es un paso del deshacer. Solo dentro del mismo modo.
- Barra de exportar, en este orden (decisión del usuario): Historia (llegará pronto: a una historia de Instagram directamente, ADR 009; su icono es la cámara de Instagram, `InstagramGlyph` en `action-tile.tsx`, dibujada con vistas, con el grosor y el tamaño a la vista de los iconos de al lado: trazo de 1,7 pt en 22 pt), Compartir, Guardar y Copiar.
