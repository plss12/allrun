---
paths:
  - 'src/core/{activity-charts,line-chart,summary-chart}*'
  - 'src/editor/{charts-scene,template-scene}*'
  - 'src/home/period-line-chart*'
---

# Gráficas

Las de actividad (ADR 008) van en este orden: parciales, ritmo, desnivel, FC, potencia (`availableActivityCharts`; decisión del usuario: las barras primero, para que las líneas salgan juntas).

La línea de ritmo, como la de Strava (decisión del usuario tras ver cuatro opciones): las 150 medias por tramos (`LINE_POINTS`) sin media móvil encima, para que se vean los cambios de ritmo, y colocadas por su ritmo (`lineLevel` con la escala `pace`: un minuto por kilómetro mide lo mismo a 4:00 que a 7:00), lo más rápido arriba. La serie sigue en velocidad (la cabecera la lee así); solo cambia la altura. En bici, que escribe velocidad, la escala es lineal. Ninguna línea lleva media móvil (decisión del usuario: todas igual, como Strava; antes FC con 3 puntos y potencia con 9, unos 3 min en 2 h de bici, que se comía las series). Las barras de los parciales del widget de gráficas, con la misma escala que la línea de ritmo (`SplitRows` con `scale`); y lo mismo en los creativos (decisión del usuario: si un widget escribe ritmos, sus barras van por ritmo; si velocidades, por velocidad): las barras de parciales, tan largas como su ritmo (la más lenta, la más larga) o, en bici, como su velocidad; la escalera, tan ancha como rápida en la escala de lo que escribe.

## Gráficas de resúmenes (ADR 009)

Solo datos del periodo, sin la tendencia de periodos anteriores. Dos aspectos (`look`): barras destacadas (la mejor en color pleno) y línea; las barras redondeadas de antes ya no existen (las guardadas se leen como destacadas). La galería tiene una tarjeta por aspecto y agrupación, para que ningún carrusel sea largo: en un año, barras por meses, línea por meses, barras por semanas y línea por semanas; cada una con distancia y tiempo bajo tres totales y luego bajo dos. Van bajo el nombre del periodo y sus totales principales (`periodTotals`; los nombres como se escriben, no en mayúsculas), con el total de lo que dibuja la gráfica primero (en las de tiempo, «Tiempo» antes que «Distancia»). La semana en curso se llama «Esta semana»; el mes y el año, por su nombre («Octubre de 2026», «2026»), que es corto y dice cuál. Un resumen filtrado a un deporte lo nombra al lado («Esta semana · Carreras»). El valor de cada barra va justo encima de ella, redondeado y sin unidad («41», «1:18»), con «0» en las vacías, y solo se ofrece hasta 16 barras. El ritmo medio no se ofrece en resúmenes (mezcla actividades distintas; los diseños guardados con él se siguen dibujando).
