---
paths:
  - 'src/app/editor.tsx'
  - 'src/core/{history,editor-document,template-edit}*'
---

# Editor: deshacer, ajustes y cambiar de diseño

- Deshacer, rehacer y «Empezar de nuevo» cubren lo que el usuario hace sobre el diseño: el diseño o collage elegido, los widgets, las fotos y su colocación, los bordes y el fondo, en un `EditorDesign` (`layers: null` es el diseño vacío del formato, solo con la marca de agua en su sitio) en un `History` (`core/history.ts`), un paso por gesto o cambio.
- Regla para quien empieza: Profundidad, Collages y Diseños, en la fila de arriba, cambian el diseño y se deshacen; lo del desplegable son ajustes que se quedan como los dejas (decisión del usuario).
- Las fotos también se deshacen, cambiarlas y quitarlas: `photoId` y `cells` están en el diseño, las fotos se guardan como ficheros (`photos` en `app/editor.tsx`) y solo se decodifica la del lienzo.
- Los ajustes no son ediciones: la proporción, la unidad y el idioma no crean paso, no activan «Empezar de nuevo» y se quedan al deshacer, porque se aplican a todo el historial (`mapHistory`; `units`/`language` `null` son los del teléfono y la app); y también se quedan al elegir otro diseño, hasta que el usuario los cambie o empiece otro lienzo (`openChoice`: un diseño suyo abierto desde la pestaña trae los suyos).
- Elegir un diseño es empezar de cero (decisión del usuario): se pierden los widgets, incluidas las fotos pegadas, los bordes, el fondo y la colocación de las fotos (`applyDesign`), en un paso; las fotos de los widgets se van con ellos y los huecos del nuevo diseño salen vacíos, y la foto del lienzo y las de las celdas del collage se quedan donde están (`startAgain`; decisión del usuario: las fotos de los widgets y las del lienzo o el collage van por separado, nunca pasan de unos a otros, ni una de un widget se convierte en el fondo). Entre collages, las celdas que sobran guardan su foto y vuelven con un collage que las muestre. Un collage sobre un diseño también empieza de cero, y sobre lo demás solo reparte las fotos, y conserva widgets y bordes (`applyCollage`, `setCollageLayout`).
- Sin avisos ni confirmaciones al cambiar: se probó un aviso con Deshacer y no convenció al usuario. Dentro de un diseño, el panel de Collages no marca ninguna opción, y «Una foto» es la salida.
- Cambiar de formato conserva los widgets en sus posiciones relativas, sin avisar; pero el que cabía entero en el lienzo sigue cabiendo en el nuevo, reducido lo justo o metido hacia dentro (`keepInCanvas`, con los widgets medidos en los dos formatos al elegirlo: `setFormat` con `LayerSizes`), porque las piezas grandes (Polaroid, Fotomatón) se salían (decisión del usuario). Cada uno recuerda dónde estaba (`fitted` en `EditorDesign`): si no se ha tocado desde entonces, al volver a su proporción vuelve tal cual, y en una tercera se coloca desde donde estaba (decisión del usuario: reducido en una apaisada, no volvía a su tamaño). Los widgets se miden en cada proporción de la que vienen y a la que van (`setFormat` con `LayerSize`). Se mira cada eje por separado: la tira de película de su diseño, que se sale por los lados a propósito, sigue saliéndose por ellos, pero cabe a lo alto.
- «Empezar de nuevo» vuelve a como empezó el lienzo (`DesignStart`, `canvasStart`), aunque se haya elegido otro diseño después: al diseño o collage con que se abrió, o al diseño vacío; los ajustes y las fotos se quedan (decisión del usuario).
- Cerrar pregunta solo si hay algo que perder, lo mismo que activa «Empezar de nuevo» (`canStartOver`): cambiar solo una foto no pregunta (decisión del usuario).
- Cambiar de foto la vuelve a centrar cubriendo el lienzo (decisión del usuario), en un paso que devuelve la anterior al deshacer.

## Unidad e idioma del diseño

ADR 009. Uno para todos los widgets, nunca uno por widget (una imagen que mezcle «Distance» y «Ritmo» se vería rara). El idioma cambia todo lo que escriben los widgets (nombres de los datos, deportes, fechas, números, réplicas, versículos, citas y frases), y las listas de versículos, citas y frases se muestran en él; no el texto libre ni el nombre del lugar. Los widgets traducen con `i18n.getFixedT(language)` en su `layerContext`, en un solo sitio. Sin elegir, los del teléfono y la app; se guardan con los diseños del usuario.
