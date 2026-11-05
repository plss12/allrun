---
paths:
  - 'scripts/icons/**'
  - 'scripts/brand/**'
  - 'src/ui/{app-icon,sport-glyph,centering}*'
  - 'src/ui/icons/**'
  - 'src/editor/icons/**'
  - 'src/editor/brand/**'
  - 'docs/marca/**'
---

# Iconos y marca

## Iconos

- `scripts/icons/` genera, con `npm run icons`: los de la interfaz (`build-ui-icons.mjs`, a `src/ui/icons/ui-icons.generated.ts`: Material Symbols Rounded de línea, peso 500, cada uno centrado por su forma, y unos pocos dibujados por nosotros; un test los comprueba todos, ADR 013); los de deporte y de las réplicas (Material Symbols, Apache 2.0, a `src/editor/icons/sport-icons.generated.ts`); y con esos trazados, la fuente con la que los dibujan las pantallas (`build-icon-font.mjs`, a `assets/fonts/allrun-icons.otf`, necesita uv; un test la compara con los trazados): un lienzo de Skia por icono era una textura más que crear y componer (ADR 014).
- Los de deporte son los mismos en toda la app (decisión de producto): Skia en las imágenes (`SPORT_ICON_PATHS`, `iconBox`) y la fuente en pantalla (`SportGlyph` en `ui/sport-glyph.tsx`), con la misma forma; nunca un PNG, que RN carga de forma asíncrona y aparecía de golpe, ni SF Symbols, que la licencia de Apple no deja exportar a una imagen.
- Cada familia tiene el suyo y algunas modalidades uno propio (`sportIcon`): senderismo (el de Material), y trail y bici de montaña, compuestos por el script: el corredor y la bici sobre un suelo irregular que sube, dibujado por nosotros y unido en un solo trazado con CanvasKit.
- Todo icono va centrado en su botón (decisión del usuario, muy importante): por eso son propios y se centran por su forma al generarlos (`ui/icons/ui-icons.test.ts`); los que apuntan a un lado (las flechas) van por el centro del triángulo que los rodea, porque por su caja parecen desplazados hacia su lado abierto (`POINTING`).
- Decisiones del usuario sobre iconos: reiniciar es «refrescar» en espejo; Collages son cuatro paneles que se tocan, y Diseños, dos y uno alto, los dos como un solo marco; guardar y exportar comparten bandeja y flecha.

## Marca

- El logo tiene solo 3 calles (ADR 010; las 4 del diseño original se empastaban en tamaños pequeños, y se borraron para no usarlas por error). La fuente de verdad es `scripts/brand/build-brand.mjs` (`npm run brand`), con las coordenadas del diseño original: genera los ficheros de `docs/marca` (monograma, nombre, logo apilado y horizontal, en color, blanco y negro, e icono), los iconos de la app y `src/editor/brand/geometry.generated.ts`. La guía de marca (`docs/marca/AllRun · Guía de marca.docx`) describe esa versión; si cambia la marca, se actualiza con ella.
- Logos y marcas de agua siempre como vectores de Skia (`editor/brand/brand-art.tsx`), nunca imágenes escaladas. Marca de agua por defecto: solo «AllRun» (promociona el nombre); el monograma y el conjunto son opciones.
- Colores: Track Red `#C94A2E` (acento), Night Ink `#141B2D`, Chalk `#F6F1EA`.
