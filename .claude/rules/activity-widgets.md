---
paths:
  - 'src/core/activity-block*.ts'
  - 'src/editor/activity-blocks*.tsx'
  - 'src/test-utils/activity-blocks.ts'
---

# Widgets mixtos de actividades (`core/activity-block.ts`, `editor/activity-blocks.tsx`)

Se maquetan con cajas medidas (columnas, filas, reglas, icono), que reutilizan los widgets de resúmenes. Las reglas comunes a todos los widgets están en `widgets.md`.

## Tipográficos

- Los de datos se rehacen uno a uno a partir de ejemplos del usuario: `bigPair`/`bigTrio`, un dato grande con dos o tres debajo repartidos a su ancho, en ancho, estirado (no solo es la letra: el estirado se dibuja más alto), con el día encima a lo ancho (sobre el ancho o el estirado, y también solo con el dato grande: `bigSolo`; el día no se estira, la tilde se despegaría) o con la ruta encima (solo con GPS); y los de fecha (`dayRoute`, `dayBetween`, `dayOver`, `dayColumns`, `dataStack`), cada uno con una fuente distinta para que la galería se vea variada.
- La torre (`tower`, para una esquina de la foto, una sola versión): cantidad, unidad y palabra corta del deporte (`widgets.tower.sports`) una debajo de otra, en Bowlby One SC estirada, con dos datos pequeños girados junto al deporte, en Space Mono fija (no cambia con la letra) y con el ritmo sin «min» (`plainMetricText(..., 'tight')`: «5:44/km»); arriba la distancia con un decimal redondeado («11.3 KM») y abajo ritmo y tiempo; sin distancia, las calorías arriba y tiempo y FC abajo (`towerMetrics`); el desnivel no va nunca, porque sin nombre se confunde con minutos.
- Los datos en línea (`dataLine`): los tres o dos más importantes en una línea, en Unbounded, el ritmo con sus marcas. En la torre y en la línea, el tiempo va sin segundos (decisión de producto: alargan y aportan poco).
- Los widgets con más texto pueden escribir el ritmo con su unidad y el tiempo en unidades (`plainMetricText(..., 'words')`: «Día y datos» y la tarjeta), con las unidades de tiempo más cortas («1h 5min 5s», `compactDurationUnits`).
- La tarjeta (`card`): 3 o 6 datos con su nombre corto encima, con o sin el nombre de la actividad, sobre un rectángulo translúcido de esquinas rectas, en Space Mono; no ofrece Fondo (ya lo es), con el dato principal o el tiempo arriba (el estirado empieza en Bowlby One SC, «Gruesa»).
- Cada línea se recorta a sus letras reales: a la altura de sus mayúsculas (`CAP_HEIGHTS`), o de sus minúsculas y tildes cuando las lleva, y bajando lo que bajen sus minúsculas (`lettersExtent` de `editor/fonts.ts`, medidas de los contornos), así que pasar a minúsculas no abre huecos; los textos estirados proyectan su sombra ya estirados, no dentro del párrafo.
- El tiempo arriba no se ofrece (decisión de producto; los diseños guardados con él se siguen dibujando).

## Réplicas

Notas, Mensaje, Música, Cámara, Vueltas (las vueltas de la actividad, no los parciales), Gran Premio, Alarma, Ubicación, barras y escalera de parciales, Verificado, Frase (WhatsApp con frase de la lista o propia), Subrayado, Ticket, Tarjeta de embarque (con la ciudad de salida en la banda; «Tarjeta de embarque» mientras no se conoce), Información nutricional y Equivalencias (las dos últimas, en `widgets.md`). La hoja de tiempos usa letra monoespaciada.

## Tarjetas de la galería de actividades

Los widgets parecidos comparten tarjeta (`blockTile`). El orden de Datos es el de `DATA_TILES`: dato grande (ancho y estirado) · día y dato grande · día y dato solo (el día pequeño primero, para dar variedad) · torre · datos apilados · datos en línea (primero con el nombre de cada dato encima, alineados a la izquierda y en minúsculas, como Strava; nombres y datos cortados como una sola línea para que compartan línea base) · tarjeta (primero con el nombre de la actividad) · día entre datos · día sobre datos · día y datos · ruta con dato grande (Unbounded, la ancha, elegida por el usuario) · día y ruta (Permanent Marker, como escrito a mano); las dos de ruta, solo con GPS. Las primeras páginas de las tarjetas alternan fuentes para que la galería se vea variada. El orden de los creativos lo decide `CREATIVE_THEMES` (ver `gallery.md`).
