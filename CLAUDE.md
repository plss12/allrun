@AGENTS.md

# AllRun

## Proyecto

App móvil (iOS + Android) para poner datos de Strava sobre tus fotos con libertad total de diseño: una actividad o resúmenes de semana, mes, año o rango personalizado (el hueco que no cubre la competencia). Se comparte como imagen o como sticker PNG transparente. Es un MVP pensado para crecer. Qué queda y en qué orden: `docs/roadmap.md`.

## Stack y comandos

- Stack: Expo SDK 58 + Expo Router + TypeScript `strict`; editor con `@shopify/react-native-skia` + gesture-handler + reanimated; Supabase; Zod; i18next (es/en); Sentry.
- `npm start`: dev en Expo Go (iPhone) · `npm run start:build`: dev en la build propia (Android) · `npm test` · `npm run lint` (incluye Prettier) · `npm run format` · `npm run typecheck` · `npx expo export --platform ios --platform android`: build del bundle · `npm run icons`, `npm run brand`: generadores.
- Comprobaciones: `npm run check:fast` mientras se itera (o `npx jest --findRelatedTests <ficheros>`) y `npm run check`, espejo exacto de la CI, una vez antes de pedir la prueba en el teléfono y antes del commit.
- Builds: la de desarrollo de Android se compila en Ubuntu (WSL) con `scripts/build-android-wsl.sh`, solo al cambiar código nativo; en Windows, las rutas de C++ pasan del límite de 260 caracteres. Con `release`, la versión con el JavaScript dentro, para medir como en producción; se instala encima de la de desarrollo. EAS (`eas.json`) es para las builds finales y para iOS (decisión del usuario: cada intento son una hora). El iPhone sigue probando en Expo Go, así que el SDK solo se sube cuando Expo Go ya lo soporte; notas de la subida en `docs/decisions/001-stack.md`.

## Reglas por área

El detalle vive en `.claude/rules/`, y cada regla se carga sola al leer o editar sus ficheros. Lo que solo importa a un área se escribe en su regla; aquí, solo lo que vale en cualquier sesión.

`editor`, `editor-canvas` (gestos, foto, filtros, collages), `editor-history` (deshacer), `editor-color`, `editor-photos` (soportes, diseños, exportar) · `widgets`, `activity-widgets`, `summary-widgets`, `charts` · `gallery` · `skia-memory` · `app-shell` (carga, barra, inicio, selección) · `icons-and-brand` · `data-and-templates` · `accounts` (entrar, perfil, sincronización) · `scene-tests`.

## Estructura

Las carpetas que aún no existen se crean en su hito.

- `src/app/`: solo pantallas y layouts (Expo Router).
- `src/core/`: dominio puro y testeado (deportes, métricas, resúmenes, gráficas, widgets, plantillas, diseños, catálogo de la galería, exportación). Sin imports de React Native ni de E/S.
- `src/sources/`: implementaciones de `ActivitySource`. `strava/schema.ts` valida con Zod y mapea al modelo `Activity`, y `strava/detail.ts` los _streams_, parciales y vueltas al `ActivityDetail`; `fixtures/` genera un historial sintético con el formato de Strava que pasa por esos mismos esquemas.
- `src/data/`: proveedores de datos: fuente de actividades, cuenta y sesión, conexión con Strava, perfil, plantillas del usuario y su sincronización, colores favoritos, frases y nombre del lugar.
- `src/account/`: pantallas de la cuenta: entrar, contraseña nueva, conectar Strava y perfil.
- `src/editor/`: lienzo Skia, widgets, galerías, gestos y exportación.
- `src/home/`: inicio. `src/photos/`: la cuadrícula propia de fotos.
- `src/ui/`: piezas comunes de interfaz: iconos, texto, barra superior, hojas, formato de datos y estados de carga y error.
- `src/i18n/`: i18next con textos en `locales/en.ts` (fuente de las claves) y `locales/es.ts`, que el compilador obliga a tener las mismas claves; las claves de `t()` están tipadas.
- `src/test-utils/`: helpers de tests (`makeActivity`, `makeSummary`, escenas con CanvasKit).
- `assets/images/stock/`: fotos de las miniaturas de los diseños (Pexels, origen en `SOURCES.md`; originales en `docs/Fotos`, fuera de git).
- `scripts/`: generadores de marca e iconos, y la build de Android.
- `supabase/`: esquema (`migrations/`) y Edge Functions (`functions/`: borrar la cuenta y los tokens de Strava, con lo común en `_shared/`).
- `docs/decisions/`: ADRs. Léelos antes de tocar fuentes de datos, cuentas, plantillas, gráficas o el editor.

## Convenciones

- **Rendimiento ante todo** (decisión de producto: la app va a escalar a muchos usuarios): sin esperas visibles ni consumos que crezcan con el uso. Guardar lo que no hace falta rehacer en cada render o apertura, liberar lo nativo que se maqueta en lote, cargar lo pesado una vez y por adelantado, y montar solo lo visible. La vara de medir es un móvil modesto (Samsung M32), no el iPhone: gestos a 16 ms o menos por fotograma, scroll a 20 ms o menos, y abrir cualquier pantalla o panel en menos de 300 ms sin fotogramas de más de 100 ms.
- **Cómo medir** (ADR 014): con `adb`, repitiendo el mismo gesto (`input swipe`, `dumpsys gfxinfo`, `dumpsys meminfo`) y quitando una cosa cada vez; en el iPhone, marcas `[DEBUG-…]` temporales. En Android, la APK de `release` (es `profileable`: Perfetto y simpleperf la leen), compilada tras instalarla como la de la tienda (`cmd package compile -m speed-profile -f com.plss12.allrun`) y en un segundo arranque: recién instalada se interpreta y la caché de shaders de Android está vacía. `input swipe` solo envía unos 54 toques por segundo: los fps de un gesto medidos así son los suyos. Dos dedos no se pueden escribir en la pantalla táctil del teléfono (SELinux): se hacen con una pantalla táctil virtual de la herramienta `hid` de Android (JSON con `register`, `report` y `delay`; el teléfono tarda unos 5 s en añadirla). Android redibuja la ventana entera en cada fotograma de un scroll: en una lista, nada de sombras difuminadas, `overflow: 'hidden'` ni degradados de vista. Una vista animada con Reanimated actualiza el árbol de la pantalla en cada fotograma: lo que siga al dedo, mejor en Skia. Una vista con lienzos dentro que cambia de opacidad, `pointerEvents` o accesibilidad lleva `collapsable={false}`: si no, React Native la aplana o no según esos valores, mueve sus hijos de vista nativa y cada lienzo rehace su superficie. Si un cambio no debe verse, compara capturas antes y después píxel a píxel. Expo Go guarda el paquete de producción y no lo pide de nuevo al recargar: comprueba con una marca que el código es el actual.
- **La app se ve igual en todos los teléfonos** (ADR 013, decisión del usuario): mismos iconos (`AppIcon`), misma letra (`Text` de `ui/text.tsx`, Inter) y mismos colores, fijos. ESLint prohíbe el `Text` y el `ActivityIndicator` de React Native (`Spinner` de `ui/spinner.tsx`) y `expo-symbols`. Solo es nativo lo que es del sistema: alertas, hoja de compartir, teclado, selector de fechas, permisos, barra de estado y gesto de volver. Se prueba en el iPhone y en un Android físico.
- **Simetría y centrado ante todo** (decisión del usuario, muy importante): todo icono centrado en su botón y todo en la app, alineado y simétrico. Las filas se miden para 360 pt, el ancho de un Android pequeño (`editor/editor-layout.ts`, con test).
- **Calidad ante todo** (es una app de fotos): las fotos se dibujan con filtrado trilineal, y logos y marcas siempre en vector.
- Todo texto visible pasa por `t()`, en inglés y en español, salvo las frases de la tabla de Supabase. Los minutos se escriben siempre «min», en ningún widget ni idioma una «m» sola: junto a otros datos se lee como metros (decisión de producto; un test de i18n lo exige).
- Todo botón previsto en el rediseño (ADR 009) aparece ya, aunque su función llegue después: al tocarlo avisa de que llegará pronto.
- Solo fuentes con licencia libre (OFL, de Google Fonts por `@expo-google-fonts`): las de pago no, porque la app las lleva dentro y eso exige licencia de app.
- Hermes, el motor del teléfono, no trae todo lo de Node, y ni los tipos ni los tests lo detectan: `toSorted` rompió la galería en el iPhone. Para ordenar, `sort` sobre una copia.
- `adjustsFontSizeToFit` no se usa (ESLint lo prohíbe): en Android encoge el texto aunque quepa (medido un 11 % en un botón) y lo deja arriba a la izquierda de su caja. El tamaño se elige por la longitud del texto, igual para toda una fila (`actionLabelSize` en `editor/editor-layout.ts`, con un test que mide con la letra real a 360 pt), o el texto se parte en líneas.
- Gestos con la API de hooks de gesture-handler 3 (`usePanGesture`, `useSimultaneousGestures`…), no con `Gesture.*`, obsoleta; sus callbacks, en línea en el objeto del hook, el plugin de worklets las convierte en worklets y corren en el hilo de UI.
- Funciones de `core/` que corren en gestos (p. ej. `photo-placement.ts`): llevan la directiva `'worklet'` (es solo un string, siguen siendo puras) y sus helpers van definidos antes que quien los usa, porque el plugin de worklets las convierte en variables y pierden el _hoisting_.
- Tests junto al código (`*.test.ts`); el dominio de `src/core/` siempre con tests. Lo que depende de cómo dibuja Skia se prueba con CanvasKit (`scene-tests.md`), que no siempre coincide con Skia nativo: lo que se use de Skia se comprueba en `node_modules/@shopify/react-native-skia/cpp/api`.
- Versión mínima: Node 22.13 (la de `engines` y la CI). npm fijado en `packageManager` (11.19.1); la CI instala esa versión. Las npm anteriores escriben un lockfile incompleto (faltan peers opcionales como `@emnapi/*`) que rompe `npm ci`. Si `npm --version` es menor, cambia dependencias con `npx npm@11.19.1 install …`.
- Estilo: Prettier (ancho 100, comillas simples), aplicado por ESLint y comprobado en la CI.

## Skills

- `expo-native-ui`: pantallas y componentes con aspecto nativo.
- `animate-expo`: animaciones y gestos del editor (Reanimated, Gesture Handler).
- `vercel-react-native-skills`: rendimiento y buenas prácticas de React Native (listas, re-renders, imágenes).
- `supabase`: Edge Functions, auth y sincronización de plantillas.
- `expo-module`: el módulo nativo de segmentación para el efecto de profundidad.
- `expo-dev-client`: _development builds_ e instalación en los teléfonos.
- `eas-app-stores`: `eas.json`, TestFlight y envío a las tiendas.
- `expo-upgrade`: subir de SDK de Expo o arreglar versiones de dependencias.
