---
paths:
  - 'src/core/{activity-charts,line-chart,summary-chart}*'
  - 'src/editor/{charts-scene,template-scene}*'
  - 'src/home/period-line-chart*'
---

# Gráficas

Las de actividad (ADR 008) van en este orden: ritmo, parciales, desnivel, FC, potencia (`availableActivityCharts`).

## Gráficas de resúmenes (ADR 009)

Solo datos del periodo, sin la tendencia de periodos anteriores. Dos aspectos (`look`): barras destacadas (la mejor en color pleno) y línea; las barras redondeadas de antes ya no existen (las guardadas se leen como destacadas). La galería tiene una tarjeta por aspecto y agrupación, para que ningún carrusel sea largo: en un año, barras por meses, línea por meses, barras por semanas y línea por semanas; cada una con distancia y tiempo bajo tres totales y luego bajo dos. Van bajo el nombre del periodo y sus totales principales (`periodTotals`; los nombres como se escriben, no en mayúsculas), con el total de lo que dibuja la gráfica primero (en las de tiempo, «Tiempo» antes que «Distancia»). La semana en curso se llama «Esta semana»; el mes y el año, por su nombre («Octubre de 2026», «2026»), que es corto y dice cuál. Un resumen filtrado a un deporte lo nombra al lado («Esta semana · Carreras»). El valor de cada barra va justo encima de ella, redondeado y sin unidad («41», «1:18»), con «0» en las vacías, y solo se ofrece hasta 16 barras. El ritmo medio no se ofrece en resúmenes (mezcla actividades distintas; los diseños guardados con él se siguen dibujando).
