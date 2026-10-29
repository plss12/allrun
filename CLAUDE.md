@AGENTS.md

# AllRun

## Proyecto

App móvil (iOS + Android) para poner datos de Strava sobre tus fotos con libertad total de diseño: una actividad o resúmenes de semana, mes, año o rango personalizado (el hueco que no cubre la competencia). Se comparte como imagen o como sticker PNG transparente. Es un MVP pensado para crecer: suscripciones, vídeo, efecto de profundidad, más fuentes de datos.

## Stack y comandos

- Stack: Expo SDK 58 + Expo Router + TypeScript `strict`; editor con `@shopify/react-native-skia` + gesture-handler + reanimated; Supabase (Edge Functions para el OAuth de Strava, usuario anónimo); Zod; i18next (es/en); Sentry.
- `npm start`: dev (Expo Go en el iPhone) · `npm test`: tests · `npm run lint`: lint (incluye Prettier) · `npm run format`: formatear · `npm run typecheck`: tipos · `npx expo export --platform ios --platform android`: build del bundle.
- Comprobaciones: `npm run check:fast` mientras se itera (tipos incrementales, lint y los tests de lo cambiado; o `npx jest --findRelatedTests <ficheros>`) y `npm run check`, espejo exacto de la CI, una vez antes de pedir la prueba en el iPhone y antes del commit. La CI corre en tres trabajos en paralelo (estático, tests, doctor y bundle) con la preparación común en `.github/actions/setup`.

## Reglas por área

El detalle de cada área vive en `.claude/rules/`, que se carga solo al leer o editar sus ficheros: `widgets.md` (lo común a los widgets, información nutricional y equivalencias), `activity-widgets.md`, `summary-widgets.md` (también sus gráficas), `gallery.md` (secciones, temas y comodines), `editor.md` (pasos, deshacer, fotos, exportar, memoria nativa de Skia) y `scene-tests.md`. Lo que solo importa a un área se escribe en su regla; aquí, solo lo que vale en cualquier sesión.

## Estructura

Las carpetas que aún no existen se crean en su hito.

- `src/app/`: solo pantallas y layouts (Expo Router).
- `src/core/`: dominio puro y testeado (deportes, métricas, resúmenes, gráficas, widgets, plantillas, catálogo de la galería, exportación). Sin imports de React Native ni de E/S.
- `src/sources/`: implementaciones de `ActivitySource`. `strava/schema.ts` valida con Zod y mapea al modelo `Activity`, y `strava/detail.ts` los _streams_, parciales y vueltas al `ActivityDetail`; `fixtures/` genera un historial sintético con el formato de Strava (y _streams_, parciales y vueltas coherentes con los totales: algunas carreras son series) que pasa por esos mismos esquemas.
- `src/data/`: proveedores de datos de la app: la fuente de actividades, el almacén de plantillas del usuario (`TemplateStore`: un JSON por plantilla en local; Supabase cuando llegue el login), los colores favoritos (`color-favorites.ts`, un JSON en local) y el nombre del lugar de una actividad (`place-lookup.ts`, con el geocodificador del sistema hasta el hito 4).
- `src/editor/`: lienzo Skia, widgets, galería, gestos y exportación.
- `src/home/`: inicio: galería de actividades, tarjetas de resumen por periodo y su gráfica de línea.
- `src/ui/`: piezas comunes de interfaz (formato de fechas y datos, estados de carga y error, la pantalla de carga).
- `src/i18n/`: i18next con textos en `locales/en.ts` (fuente de las claves) y `locales/es.ts`, que el compilador obliga a tener las mismas claves; las claves de `t()` están tipadas.
- `src/test-utils/`: helpers de tests (`makeActivity`, `makeSummary`, escenas con CanvasKit).
- `scripts/brand/`: generador de variantes de marca e iconos de la app (`npm run brand`).
- `scripts/icons/`: descarga los iconos de deporte y de las réplicas (Material Symbols, Apache 2.0) a `src/editor/icons/sport-icons.generated.ts` (`npm run icons`). Son los mismos en toda la app (decisión de producto) y siempre los dibuja Skia: en las imágenes, porque los SF Symbols no se pueden exportar, y en pantalla (`SportGlyph` en `ui/sport-glyph.tsx`), porque un PNG se carga de forma asíncrona y el icono aparecía de golpe. Por eso el filtro del inicio es un desplegable propio (`home/sport-filter-menu.tsx`) y no el menú nativo: react-native-screens pone la imagen de una opción cuando termina de cargarla, cuando iOS ya ha construido el menú, y no se ve. Cada familia tiene el suyo y algunas modalidades uno propio (`sportIcon`): senderismo (el de Material), y trail y bici de montaña, compuestos por el script: el corredor y la bici sobre un suelo irregular que sube, dibujado por nosotros y unido en un solo trazado con CanvasKit. Para un deporte, siempre estos iconos.
- `supabase/functions/`: canje y renovación de tokens de Strava.
- `docs/decisions/`: ADRs. Léelos antes de tocar fuentes de datos, cuentas, plantillas, gráficas o el editor.

## Convenciones

- Rendimiento ante todo (decisión de producto: la app va a escalar a muchos usuarios y tiene que ser ágil y fluida): se desarrolla pensando en optimizar desde el principio, sin esperas visibles ni consumos que crezcan con el uso. Antes de dar algo por bueno: medir en el iPhone lo que pueda tardar (marcas `[DEBUG-…]` temporales), guardar lo que no hace falta rehacer en cada render o apertura, liberar lo nativo que se maqueta en lote (`editor.md`), cargar lo pesado una vez y por adelantado, y montar solo lo visible en listas y carruseles.
- Pantalla de carga propia (`ui/launch-screen.tsx`): el monograma donde lo pone la splash nativa y el nombre debajo, sobre el fondo de la app (negro, como el inicio y la splash oscura), mientras cargan las fuentes de Skia (32 ficheros, 5,4 MB, una vez por sesión: `loadEditorFonts`), como mucho 8 s (`MAX_LAUNCH_WAIT_MS` en `app/_layout.tsx`). En Expo Go las fuentes se descargan de Metro por la WiFi y la splash nativa es el icono de la app; en una build instalada se leen del teléfono.
- Versión mínima: Node 22.13 (la de `engines` y la CI).
- npm fijado en `packageManager` (11.19.1); la CI instala esa versión. Las npm anteriores escriben un lockfile incompleto (faltan peers opcionales como `@emnapi/*`) que rompe `npm ci`. Si `npm --version` es menor, cambia dependencias con `npx npm@11.19.1 install …`.
- Estilo: Prettier (ancho 100, comillas simples), aplicado por ESLint y comprobado en la CI.
- Tests junto al código (`*.test.ts`); el dominio de `src/core/` siempre con tests. Lo que depende de cómo dibuja Skia se prueba con CanvasKit (`scene-tests.md`), que no siempre coincide con Skia nativo: lo que se use de Skia se comprueba en `node_modules/@shopify/react-native-skia/cpp/api`.
- SDK 58 (desde el 2026-10-29; notas de la subida en `docs/decisions/001-stack.md`): el que abre el Expo Go de la App Store, que solo admite uno. Antes de subir de SDK, comprueba que Expo Go ya lo soporte. Gestos con la API de hooks de gesture-handler 3 (`usePanGesture`, `useSimultaneousGestures`…), no con `Gesture.*`, obsoleta; sus callbacks, en línea en el objeto del hook, el plugin de worklets las convierte en worklets y corren en el hilo de UI.
- Marca: el diseño original está en `docs/marca` (no tocar). Las variantes (monograma reducido de 3 calles, logo horizontal, monocromos), los iconos de la app y `src/editor/brand/geometry.generated.ts` salen de `scripts/brand/build-brand.mjs` (`npm run brand`), que reconstruye el monograma desde su geometría. Iconos y marcas de agua usan el monograma reducido porque las 4 calles se empastan en tamaños pequeños.
- Calidad ante todo (es una app de fotos): logos y marcas de agua siempre como vectores de Skia (`editor/brand/brand-art.tsx`), nunca imágenes escaladas; las fotos se dibujan con filtrado trilineal. Marca de agua por defecto: solo «AllRun» (promociona el nombre); el monograma y el conjunto son opciones. Colores: Track Red `#C94A2E` (acento), Night Ink `#141B2D`, Chalk `#F6F1EA`. La app es siempre oscura (ADR 009): `userInterfaceStyle` en `app.json` y `Appearance.setColorScheme('dark')` en el layout, que es lo que lo aplica en Expo Go. En Android, los colores de iOS en oscuro, fijos (`theme/colors.ts`), y no los dinámicos de Material You, que siguen el fondo de pantalla: así lo que dibuja Skia (los iconos de deporte) es del mismo color que el texto de al lado y la app se ve igual en todos los teléfonos.
- Strava: datos bajo demanda y caché local de menos de 7 días; el trazado llega completo al dueño, así que el recorte de privacidad del inicio y del final viene activado por defecto; de Strava solo se usan los logos oficiales «Powered by Strava» / «Compatible with Strava», sin modificar. Por decisión de producto, el editor solo ofrece el logo de AllRun.
- Datos de ejemplo siempre sintéticos (`generateStravaFixtures`, con semilla fija): el repo es público y las actividades reales revelarían dónde vive el usuario.
- Cualquier `sport_type` de Strava tiene que funcionar. Deporte en dos niveles (`core/sports.ts`): la modalidad decide las métricas (`core/metrics.ts`), la familia agrupa para los resúmenes y los filtros (`SPORT_FAMILIES`: carreras, ciclismo, caminatas, natación, entrenos y otros); lo desconocido cae en `other`, el perfil genérico. «Otros» solo aparece si el usuario tiene alguna.
- Fechas: los periodos se agrupan por fecha local (`LocalDate`, `YYYY-MM-DD`) con aritmética de días en `core/dates.ts`, sin librerías de fechas ni `Date` local, salvo en la frontera con la plataforma (reloj y selector de fechas nativo: `ui/today.ts`).
- Todo texto visible pasa por `t()`, en inglés y en español. Los minutos se escriben siempre «min», en ningún widget ni idioma una «m» sola: junto a otros datos se lee como metros (decisión de producto; un test de i18n lo exige).
- Solo fuentes con licencia libre (OFL, de Google Fonts por `@expo-google-fonts`): las de pago no, porque la app las lleva dentro y eso exige licencia de app.
- Plantillas (`core/template.ts`, versión 2): formato + capas ligadas a datos, con posiciones relativas (0..1), dónde va la foto (`photo`, relativa al lienzo), el fondo (`background`) y, opcional, la unidad del diseño (`units`). Las de versión 1 se migran solas (foto cubriendo, fondo `auto`). Se crean con `newTemplate`. Hay capas solo de actividad y solo de resumen; añadir tipos de capa o campos opcionales es compatible, cambiar los existentes exige subir `version` con migración.
- Plantillas del usuario: JSON validado con Zod y guardado en local, sin nombre, por formato y modo; cuando llegue el login real, se sincronizan con Supabase (requisito firme, ver `docs/decisions/003-accounts-and-templates.md`).
- Funciones de `core/` que corren en gestos (p. ej. `photo-placement.ts`): llevan la directiva `'worklet'` (es solo un string, siguen siendo puras) y sus helpers van definidos antes que quien los usa, porque el plugin de worklets las convierte en variables y pierden el _hoisting_.
- Todo botón previsto en el rediseño (ADR 009) aparece ya, aunque su función llegue después: al tocarlo avisa de que llegará pronto.
- Hitos: 1 esqueleto · 2 núcleo con fixtures · 3 editor (3b-2 edición, 3c exportar, 3d plantillas, 3e gráficas de actividad: perfil de desnivel, ritmo, FC, potencia y parciales, con _streams_ y parciales sintéticos en los fixtures) · rediseño (ADR 009, a partir de `docs/AllRun Ideas.pdf`, solo en local): R1 inicio (galería de actividades y tarjetas de resúmenes) · R2 widgets mixtos (cerrado: widgets nuevos, después del MVP) · R3 editor a pantalla completa en un paso · R4 selección (fotos, Diseños, Stickers, collages; filtros de la foto que se cambian deslizando a los lados: Zoom Blur, Motion Blur, Portra, Mono, Ink; widget de imagen de la galería y widget de foto instantánea, la «Polaroid») · 4 Strava real (también la descarga bajo demanda de _streams_ y parciales, y las zonas de FC del atleta, que piden el permiso `profile:read_all`) + Supabase · 5 profundidad (módulo nativo, _development build_) + Sentry + TestFlight, y probar ahí la decodificación nativa de fotos directa a la GPU (ADR 004). El vídeo resumen va después del MVP.
- Lo nativo (hito 5), primero en Android: allí la _development build_ es gratis. Después se escribe la parte de iOS y se prueba unas pocas veces en el iPhone sin pagar (compilación en GitHub Actions macOS + AltStore/SideStore con Apple ID gratuito). Los 99 €/año de Apple solo cuando se decida publicar o usar TestFlight (ADR 001).

## Skills

- `expo-native-ui`: pantallas y componentes con aspecto nativo.
- `animate-expo`: animaciones y gestos del editor (Reanimated, Gesture Handler).
- `vercel-react-native-skills`: rendimiento y buenas prácticas de React Native (listas, re-renders, imágenes).
- `supabase`: Edge Functions, auth anónima y, más adelante, la sincronización de plantillas.
- `expo-module`: el módulo nativo de segmentación para el efecto de profundidad.
- `expo-dev-client`: _development builds_ e instalación en el iPhone.
- `eas-app-stores`: `eas.json`, TestFlight y envío a las tiendas.
- `expo-upgrade`: subir de SDK de Expo o arreglar versiones de dependencias.
