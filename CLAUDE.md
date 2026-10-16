@AGENTS.md

# AllRun

## Proyecto

App móvil (iOS + Android) para poner datos de Strava sobre tus fotos con libertad total de diseño: una actividad o resúmenes de semana, mes, año o rango personalizado (el hueco que no cubre la competencia). Se comparte como imagen o como sticker PNG transparente. Es un MVP pensado para crecer: suscripciones, vídeo, efecto de profundidad, más fuentes de datos.

## Stack y comandos

- Stack: Expo SDK 58 + Expo Router + TypeScript `strict`; editor con `@shopify/react-native-skia` + gesture-handler + reanimated; Supabase (Edge Functions para el OAuth de Strava, usuario anónimo); Zod; i18next (es/en); Sentry.
- `npm start`: dev (Expo Go en el iPhone) · `npm test`: tests · `npm run lint`: lint (incluye Prettier) · `npm run format`: formatear · `npm run typecheck`: tipos · `npx expo export --platform ios --platform android`: build del bundle (lo mismo que la CI).

## Estructura

Las carpetas que aún no existen se crean en su hito.

- `src/app/`: solo pantallas y layouts (Expo Router).
- `src/core/`: dominio puro y testeado (unidades, perfiles por deporte, métricas, resúmenes, recorte de privacidad de la ruta, esquema de plantillas). Sin imports de React Native ni de E/S.
- `src/sources/`: implementaciones de `ActivitySource`. `strava/schema.ts` valida con Zod y mapea al modelo `Activity`; `fixtures/` genera un historial sintético con el formato de Strava que pasa por ese mismo esquema.
- `src/test-utils/`: helpers de tests (`makeActivity`).
- `src/editor/`: lienzo Skia, widgets, gestos y exportación.
- `supabase/functions/`: canje y renovación de tokens de Strava.
- `docs/decisions/`: ADRs. Léelos antes de tocar fuentes de datos, cuentas o plantillas.

## Convenciones

- Versión mínima: Node 22.13 (la de `engines` y la CI).
- npm fijado en `packageManager` (11.19.1); la CI instala esa versión. Las npm anteriores escriben un lockfile incompleto (faltan peers opcionales como `@emnapi/*`) que rompe `npm ci`. Si `npm --version` es menor, cambia dependencias con `npx npm@11.19.1 install …`.
- Estilo: Prettier (ancho 100, comillas simples), aplicado por ESLint y comprobado en la CI.
- Tests junto al código (`*.test.ts`); el dominio de `src/core/` siempre con tests.
- Jest 30 aunque `expo-doctor` pida 29.7: lo exige la guía oficial del SDK 58 (detalle en `docs/decisions/001-stack.md`). `expo-doctor` también marca `ios.icon` como error; es un falso positivo con la carpeta de Icon Composer, por eso no está en la CI.
- Strava: datos bajo demanda y caché local de menos de 7 días; el trazado llega completo al dueño, así que el recorte de privacidad del inicio y del final viene activado por defecto; solo se pueden usar los logos oficiales «Powered by Strava» / «Compatible with Strava».
- Datos de ejemplo siempre sintéticos (`generateStravaFixtures`, con semilla fija): el repo es público y las actividades reales revelarían dónde vive el usuario.
- Fechas: los periodos se agrupan por fecha local (`LocalDate`, `YYYY-MM-DD`) con aritmética de días en `core/dates.ts`; sin librerías de fechas ni `Date` local.
- Cualquier `sport_type` de Strava tiene que funcionar: perfiles por grupo de deporte más un perfil genérico de respaldo.
- Plantillas: JSON validado con Zod y guardado en local; cuando llegue el login real, se sincronizan con Supabase (requisito firme, ver `docs/decisions/003-accounts-and-templates.md`).
- Hitos: 1 esqueleto · 2 núcleo con fixtures · 3 editor · 4 Strava real + Supabase · 5 profundidad (módulo nativo, _development build_) + Sentry + TestFlight. El vídeo resumen va después del MVP.

## Skills

- `expo-native-ui`: pantallas y componentes con aspecto nativo.
- `animate-expo`: animaciones y gestos del editor (Reanimated, Gesture Handler).
- `vercel-react-native-skills`: rendimiento y buenas prácticas de React Native (listas, re-renders, imágenes).
- `supabase`: Edge Functions, auth anónima y, más adelante, la sincronización de plantillas.
- `expo-module`: el módulo nativo de segmentación para el efecto de profundidad.
- `expo-dev-client`: _development builds_ e instalación en el iPhone.
- `eas-app-stores`: `eas.json`, TestFlight y envío a las tiendas.
- `expo-upgrade`: subir de SDK de Expo o arreglar versiones de dependencias.
