---
paths:
  - 'src/editor/{editor-canvas,gesture-textures,template-scene}*'
  - 'src/core/{layer-transform,photo-placement,collage}*'
---

# Lienzo: gestos, foto libre y collages

## Selección

- Un widget seleccionado lleva solo cuatro esquinas finas, como el visor de una cámara: blancas con un borde oscuro, de 14 pt (o un tercio del lado si es más corto), en las esquinas de su caja más su margen (`frameCorners` en `editor-canvas.tsx`); siguen al dedo mientras se mueve o cambia de tamaño. Decisión del usuario tras probar y descartar el marco redondeado entero («feo»), oscurecer lo demás (un widget negro no destacaba) y un halo con su forma («horrible»). Se dibujan en el lienzo, encima de la escena, y la imagen exportada nunca las lleva.

## Gestos

- Durante un gesto (mover, pellizcar, girar, los deslizadores de tamaño y opacidad, mover una foto) lo que se queda quieto y el widget que se mueve se dibujan una vez en texturas del hilo de UI, y cada fotograma solo las pone en pantalla (`editor/gesture-textures.ts`, ADR 014): el coste ya no depende de cuántos widgets haya. La textura del widget que se mueve tiene el doble de píxeles que ocupa y mipmaps (con los justos, sus bordes salían con dientes de sierra al girarlo). Mientras se preparan, y al terminar, la escena dibuja en vector; exportar nunca las ve. Van en el espacio de color de la pantalla, el del lienzo (`SCREEN_COLOR_SPACE` en `editor/screen-color.ts`, con test): Display P3 en el iPhone, donde el `Canvas` de Skia y las fotos lo son, y sRGB en Android, donde Skia aún no dibuja en color amplio (paso 6 del roadmap); en sRGB, en el iPhone la foto se veía más apagada mientras se movía un widget.
- Un gesto libera sus texturas un momento después de acabar, y solo si no ha empezado otro: liberar las del siguiente dejaba el lienzo en negro al mover mucho (`drawGestureTextures`, con test). Cada textura se dibuja en su propio fotograma, en una superficie que se crea y se libera en el acto: conservarlas para el gesto siguiente ahorraba 20 ms al empezarlo, pero cada arrastre dejaba 24 MB de la GPU sin volver a usarse (medido, ADR 014).
- Cada widget va recortado a su caja y al hueco de su sombra (`layerClip`), porque sus sombras son filtros de imagen sobre capas tan grandes como el recorte, y los widgets ya preparados se guardan (`PreparedLayerCache`): moverlo no rehace sus textos. El pulgar de un deslizador es de Skia (`SliderThumb`), no una vista animada.
- El valor vive en un _shared value_ en el hilo de UI y solo se confirma al soltar (`scheduleOnRN`): un `setState` por gesto, no por fotograma. La capa arrastrada se dibuja desde el _shared value_ solo mientras se arrastra; empezar y terminar el arrastre va en la misma actualización de React que la selección o el commit, para que nunca se vea un fotograma con una transformación vieja.
- Medidas, toques e imantado salen de `prepareLayers` (`editor/template-scene.tsx`) y `core/layer-transform.ts`.
- Una ruta (y las rutas del periodo) solo se agarra a menos de 22 pt de su línea (`HitLine`, con sus puntos aclarados cada 4 px): el resto de su caja, casi entera vacía en una ruta en diagonal, deja pasar los toques a la foto y a los widgets de debajo. Sus esquinas de selección siguen siendo las de la caja, como en Instagram o Canva (ver «Selección»).

## Foto libre

ADR 009, `core/photo-placement.ts`. Su colocación es relativa al lienzo (centro en fracciones del lienzo, tamaño respecto a cubrirlo, giro), así sirve con cualquier foto y cualquier copia de ella. Puede quedar más pequeña (hasta 0,2), salirse en parte (su centro nunca sale del lienzo) y girar sin hacer zoom. Se imanta como los widgets (centro, bordes de su alcance girado, ángulo recto) y al tamaño de cubrir; en un empate, el centro gana a los bordes.

## Collages

`core/collage.ts`, `collage` en la plantilla.

- El botón Collages abre los diseños (una foto, dos y tres en filas, una arriba y dos abajo, cuatro y seis; `editor/collage-menu.tsx`, un panel de 3 × 2 tan ancho como los tres botones de arriba, decisión del usuario).
- Las fotos se tocan sin separación. Las herramientas de la foto ofrecen bordes opcionales, blanco o negro, puros, alrededor de la foto y entre huecos: uno para todo el diseño, también con una sola foto, así que el menú es siempre igual (`frame` en la plantilla; decisión del usuario); elegir un diseño lo quita, y cambiar de collage lo conserva.
- Un hueco vacío muestra un «+» dibujado en el lienzo, que no sale en la imagen, y un toque abre la cuadrícula para elegir de una vez las fotos de todos los huecos vacíos, desde ese y en orden, hasta las que admita el diseño (decisión del usuario, como las piezas de varias fotos; `chooseCellPhoto`); un toque en una foto abre sus herramientas sobre ese hueco, y las demás fotos se oscurecen para que destaque, bajo los bordes y los widgets (`activeCell`; decisión del usuario, un marco no quedaba bien).
- Cada foto se mueve, amplía y gira en su hueco con los gestos e imanes de la foto normal, tomando el hueco por lienzo y recortada a él, con las guías en el hueco (`TARGET_CELL` en `editor-canvas.tsx`, en el hilo de UI y un paso al soltar). El orden de las fotos no se intercambia arrastrando: se quita una y se pone otra (decisión del usuario).
- El primer hueco es la foto del editor, con sus dos copias; los demás son `pictures` con una copia de 1536 px (`PhotoCopy 'cell'`), y solo se decodifican las que el diseño muestra: al pasar a un diseño con menos huecos, las sobrantes se guardan y vuelven con uno que las muestre, con su colocación (decisión del usuario).
- El diseño, sus bordes, sus fotos y la colocación de cada una están en el historial. El color `auto` del fondo sale de la primera foto.
