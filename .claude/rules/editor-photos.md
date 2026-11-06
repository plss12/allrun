---
paths:
  - 'src/editor/{use-pictures,prepare-photo,photo-plan,export-*,mount-*,ready-design,instant-caption,stock-photos,designs-scene,sticker-image}*'
  - 'src/core/{image-layer,designs,default-layout}*'
  - 'src/photos/**'
---

# Editor: fotos, soportes, diseños y exportar

## Copias y exportación

- Skia dibuja una copia de editor (≤ 2048 px) y se prepara en segundo plano una de exportación (≤ 4096 px, calidad máxima), que empieza 2,5 s después de elegir la foto, salvo que se exporte antes (ADR 014); la colocación es relativa al lienzo, así que las dos copias quedan igual. Detalle y alternativas en `docs/decisions/004-photo-loading.md`.
- Exportar: la misma escena del lienzo dibujada fuera de pantalla (`renderDesign`) a 1080 px de ancho, en el espacio de color de la pantalla si es JPEG (`exportColorSpace`, `SCREEN_COLOR_SPACE` en `editor/screen-color.ts`: Display P3 en el iPhone, así sale como se edita, y Skia le pone el perfil P3 de Apple, el que lee Instagram) y en sRGB si es PNG (Skia le pondría su propio perfil P3, que Instagram no reconoce); JPEG 95 si es opaca, PNG si algo se transparenta (sin foto, o con la foto sin cubrir sobre fondo transparente: `isOpaque`). Guardar, compartir y copiar desde la fila bajo el lienzo; copiar es como el sticker llega a una historia de Instagram. Ver `docs/decisions/006-export.md`.

## Fotos del usuario sobre el diseño

Capa `image`, `core/image-layer.ts`.

- Se añaden desde la sección Fotos de la galería, con la tarjeta «Tu foto» (sin marco, con marco claro o con marco oscuro), que abre la fototeca a la vez que se cierra la hoja (la hoja es nuestra, ADR 015: nada nativo se lo impide).
- El marco se elige en esa tarjeta: ninguno, claro o oscuro, en blanco y negro puros como las réplicas claras y oscuras (la alarma; Chalk y Night Ink se veían amarillento y azulado, decisión del usuario), con una sombra suave.
- Como mucho 6 por diseño, igual que un collage, y las fotos de sus huecos cuentan (`MAX_IMAGES`, `canAddImage`; añadir, duplicar o llenar un hueco de más avisa). La foto de fondo sin collage no cuenta.
- La capa solo guarda la clave de su foto: las fotos viven en el editor (`editor/use-pictures.ts`), una sola copia de hasta 2048 px que sirve para la pantalla y para exportar (una foto pegada nunca supera el lienzo), y solo las del diseño en pantalla están decodificadas; las que el deshacer quita se liberan y se decodifican de nuevo si vuelven.
- Nunca se guardan en los diseños (`saveDesign` las quita); aplicar otro diseño y «Empezar de nuevo» las quitan, como a los demás widgets.

## Foto instantánea

`caption` en la capa: una «Polaroid» de 88 × 107 mm (`instantBox`) con la foto recortada al cuadrado por el centro (sin moverla dentro, decisión del usuario), marco blanco o negro (nunca sin marco, `instantFrame`), un pie a mano en Permanent Marker y en mayúsculas, en tinta negra o blanca (`captionParagraphs` en `template-scene.tsx`), y recta (el giro, si lo quiere, lo pone el usuario; decisión del usuario).

- Las líneas centradas encogen cada una por su cuenta (un lugar largo no encoge su distancia), y si el lugar quedara por debajo del 70 % se escribe solo la ciudad (`shorterFirst`); las dos columnas de «Fecha y datos» encogen juntas.
- Dos pies (`instantCaption` en `editor/instant-caption.ts`): `place`, centrado, el lugar (ciudad y región; sin él, la fecha) sobre la distancia en palabras con un decimal («11,3 kilómetros», con la coma o el punto del idioma, decisión del usuario; sin distancia, el tiempo), y `data`, la fecha y la hora a la izquierda y los dos primeros datos de su tarjeta a la derecha (`cardMetrics`: «11,3 km», «5:54/km»); en un resumen, el nombre del periodo sobre su distancia total en palabras, y sus fechas y actividades a la izquierda y la distancia y el tiempo totales a la derecha.
- El de lugar pide antes el permiso de ubicación en Android.

## Diseños

Galería en `gallery.md`. Un diseño elegido en la pestaña abre el editor con él (parámetro `design`, `parseDesignChoice`), sin nada que deshacer, y en el editor es un paso del deshacer (`applyChoice`).

- Los de AllRun son recetas (`core/designs.ts`) que colocan los widgets para cualquier formato y dato; `editor/designs-scene.test.tsx` mide con las fuentes reales que nada se salga del lienzo ni se solape. Lo que la receta no puede medir (el ancho del mensaje, para alinearlo a la derecha de la foto) lo alinea `editor/ready-design.ts`. Los textos con `maxWidth` no hacen salto de línea: encogen. Los widgets nuevos usan la fuente mayoritaria del diseño (`designFont`), salvo los mixtos: cada uno trae la letra que le pega (`blockLettering`).
- Regla (decisión del usuario): los widgets son piezas y los diseños son combinaciones de piezas con su fondo, así que todo lo que sale en un diseño se puede poner suelto. La foto de Mensaje es «Tu foto» con las esquinas redondeadas (`rounded`, una opción junto a su marco, también en cualquier foto); el marco de película y el negativo también están en la galería de widgets.

## Soportes y huecos de foto

- La Cámara es una foto con su soporte (`mount: 'camera'`, `CameraWidget`), como la Polaroid: la foto va dentro, y si se mueve el widget, se mueve la foto (decisión del usuario; antes enmarcaba la foto de fondo, que no se movía con ella). Mide lo que el lienzo en cualquier formato, y al añadirla va debajo de los widgets que ya hay, para no taparlos. Los bloques `camera` y `periodCamera` ya no se ofrecen: son solo lo que dibuja encima, y los diseños guardados con ellos se siguen leyendo.
- Huecos de foto de un diseño (`isPhotoSlot`): una foto marcada como hueco (`slot`; no sale de su sitio, 3:4, y una foto de otras proporciones queda entera dentro: `slotBox`) o una foto en su soporte (`mount`, `IMAGE_MOUNTS`, `mountBox`; la tira de película repite la misma foto en los fotogramas de al lado, de los que asoma como mucho un 30 %, con una flecha en su dato principal, y en su diseño va inclinada 2° y se sale del lienzo por los lados, decisiones del usuario).
- Soporte, foto y datos son una sola pieza, que se mueve, escala y gira como cualquier widget (decisión del usuario; por eso no son huecos de collage, que no se mueven con su marco). En un soporte, la foto va recortada a una ventana 3:4 por el centro y no se mueve dentro (como la Polaroid; las verticales del iPhone no pierden nada). Un soporte no ofrece color, solo opacidad, como las réplicas.
- Sin foto elegida (`SAMPLE_IMAGE`), el lienzo muestra un «+» y un toque, o el botón de la foto de abajo, abre la cuadrícula; en la imagen no sale (`emptySlots`: `hint` y `blank`), y si el soporte tiene marco, se ve el fondo por la ventana. Las perforaciones del negativo son agujeros de verdad: dejan ver el fondo.
- Un diseño con huecos toma la foto del editor en el primero (clave `EDITOR_PHOTO`, que deja de dibujarse sobre el lienzo: `usesEditorPhoto`), y deshacer la devuelve, porque la foto no está en el historial y el hueco solo la nombra; cambiar la foto de ese hueco cambia la del editor. Al cambiar de diseño, las fotos de los huecos pasan a los del nuevo, en orden. Los diseños guardados conservan los huecos, vacíos (`withEmptySlots`).
- Los textos del soporte (`mount-caption.ts`) van girados a sus lados, en una letra que no se cambia (Space Mono en negrita en la película, Orbitron fina en el negativo, sin fuentes nuevas: decisión del usuario), y encogen juntos; la flecha se dibuja, porque esas letras no la tienen. «ALLRUN» va escrito con la misma letra que el resto, no con el logo, que quedaba fuera de lugar (decisión del usuario; la excepción a los logos vectoriales). Las marcas de carrete de la película, en ámbar, solo escriben datos reales: arriba, la fecha y la hora; abajo, la ciudad y «ALLRUN». Nunca números de un carrete inventados, ni el nombre de la actividad, que puede ser largo (decisiones del usuario).
