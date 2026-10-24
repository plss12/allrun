---
paths:
  - 'src/**/*scene*.test.tsx'
  - 'src/test-utils/**'
---

# Tests de escena (CanvasKit)

- Lo que depende de cómo dibuja Skia (opacidad, sombras, que nada se salga de su caja…) se prueba dibujando la escena fuera de pantalla con CanvasKit y leyendo píxeles (`alphaOutside` en `test-utils/skia-bounds.tsx`, que solo dibuja la franja que comprueba). Cada fichero lleva sus `jest.mock` de Skia (Jest los iza por fichero) y llama a `loadSceneBeforeAll()` (`test-utils/scene.ts`: CanvasKit en el propio _realm_ y el `TextDecoder` de Node); `fs` se lee con `jest.requireActual` porque el type-check no tiene tipos de Node.
- Son los tests lentos y Jest paraleliza por fichero: un suite pesado se parte en varios ficheros, con el cuerpo del test en `test-utils` (`testBlocksInTheirFonts`, `testBlocksRestyled` en `activity-blocks.ts`; `testSummaryWidgets` en `summary-blocks.ts`). Actividades: `activity-blocks-scene` (datos de un maratón y un entreno), `-creative-scene`, `-restyled-scene` y `-slanted-scene`. Resúmenes: un fichero por periodo (`summary-blocks-scene`, `-month-`, `-year-`, y lo mismo con `summary-creatives`). Lo que sale igual se dibuja una sola vez, y `loadTestFonts` reutiliza los proveedores ya cargados.
- CanvasKit no siempre coincide con Skia nativo: lo que se use de Skia se comprueba en su código nativo (`node_modules/@shopify/react-native-skia/cpp/api`), y cuando difiera, el test imita al nativo.
