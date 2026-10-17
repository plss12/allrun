@AGENTS.md

# AllRun

## Proyecto

App móvil (iOS + Android) para poner datos de Strava sobre tus fotos con libertad total de diseño: una actividad o resúmenes de semana, mes, año o rango personalizado (el hueco que no cubre la competencia). Se comparte como imagen o como sticker PNG transparente. Es un MVP pensado para crecer: suscripciones, vídeo, efecto de profundidad, más fuentes de datos.

## Stack y comandos

- Stack: Expo SDK 57 + Expo Router + TypeScript `strict`; editor con `@shopify/react-native-skia` + gesture-handler + reanimated; Supabase (Edge Functions para el OAuth de Strava, usuario anónimo); Zod; i18next (es/en); Sentry.
- `npm start`: dev (Expo Go en el iPhone) · `npm test`: tests · `npm run lint`: lint (incluye Prettier) · `npm run format`: formatear · `npm run typecheck`: tipos · `npx expo export --platform ios --platform android`: build del bundle (lo mismo que la CI).

## Estructura

Las carpetas que aún no existen se crean en su hito.

- `src/app/`: solo pantallas y layouts (Expo Router).
- `src/core/`: dominio puro y testeado (unidades, perfiles por deporte, métricas, resúmenes, recorte de privacidad de la ruta, esquema de plantillas, edición de sus capas y catálogo de widgets). Sin imports de React Native ni de E/S.
- `src/sources/`: implementaciones de `ActivitySource`. `strava/schema.ts` valida con Zod y mapea al modelo `Activity`; `fixtures/` genera un historial sintético con el formato de Strava que pasa por ese mismo esquema.
- `scripts/brand/`: generador de variantes de marca e iconos.
- `src/i18n/`: i18next con textos en `locales/en.ts` (fuente de las claves) y `locales/es.ts`, que el compilador obliga a tener las mismas claves; las claves de `t()` están tipadas.
- `src/test-utils/`: helpers de tests (`makeActivity`).
- `src/editor/`: lienzo Skia, widgets, gestos y exportación.
- `supabase/functions/`: canje y renovación de tokens de Strava.
- `docs/decisions/`: ADRs. Léelos antes de tocar fuentes de datos, cuentas o plantillas.

## Convenciones

- Versión mínima: Node 22.13 (la de `engines` y la CI).
- npm fijado en `packageManager` (11.19.1); la CI instala esa versión. Las npm anteriores escriben un lockfile incompleto (faltan peers opcionales como `@emnapi/*`) que rompe `npm ci`. Si `npm --version` es menor, cambia dependencias con `npx npm@11.19.1 install …`.
- Estilo: Prettier (ancho 100, comillas simples), aplicado por ESLint y comprobado en la CI.
- Tests junto al código (`*.test.ts`); el dominio de `src/core/` siempre con tests.
- Lo que depende de cómo dibuja Skia (opacidad, sombras…) se prueba dibujando la escena fuera de pantalla con CanvasKit y leyendo píxeles: ver `src/editor/template-scene.test.tsx` (CanvasKit cargado en el propio test por los _realms_ de Jest, `TextDecoder` de Node, `fs` con `jest.requireActual` porque el type-check no tiene tipos de Node).
- SDK 57 y no 58 porque el Expo Go de la App Store aún no soporta el 58: cuando lo haga, hay que subir (notas en `docs/decisions/001-stack.md`). Mientras, usa la API de las librerías del SDK 57 (p. ej. gesture-handler 2.x, no 3.x).
- Marca: el diseño original está en `docs/marca` (no tocar). Las variantes (monograma reducido de 3 calles, logo horizontal, monocromos), los iconos de la app y `src/editor/brand/geometry.generated.ts` salen de `scripts/brand/build-brand.mjs` (`npm run brand`), que reconstruye el monograma desde su geometría. Iconos y marcas de agua usan el monograma reducido porque las 4 calles se empastan en tamaños pequeños.
- Calidad ante todo (es una app de fotos): logos y marcas de agua siempre como vectores de Skia (`editor/brand/brand-art.tsx`), nunca imágenes escaladas; las fotos se dibujan con filtrado trilineal. Marca de agua por defecto: solo «AllRun» (promociona el nombre); el monograma y el conjunto son opciones. Colores: Track Red `#C94A2E` (acento), Night Ink `#141B2D`, Chalk `#F6F1EA`.
- Strava: datos bajo demanda y caché local de menos de 7 días; el trazado llega completo al dueño, así que el recorte de privacidad del inicio y del final viene activado por defecto; solo se pueden usar los logos oficiales «Powered by Strava» / «Compatible with Strava», sin modificar; el logo propio de Strava, no. Por decisión de producto, el editor solo ofrece el logo de AllRun.
- Datos de ejemplo siempre sintéticos (`generateStravaFixtures`, con semilla fija): el repo es público y las actividades reales revelarían dónde vive el usuario.
- Fechas: los periodos se agrupan por fecha local (`LocalDate`, `YYYY-MM-DD`) con aritmética de días en `core/dates.ts`; sin librerías de fechas ni `Date` local.
- Cualquier `sport_type` de Strava tiene que funcionar. Deporte en dos niveles (`core/sports.ts`): la modalidad decide las métricas (`core/metrics.ts`), la familia agrupa para los resúmenes; lo desconocido cae en `other`, el perfil genérico.
- Plantillas (`core/template.ts`): formato + capas ligadas a datos, con posiciones relativas (0..1). Hay capas solo de actividad y solo de resumen; añadir tipos de capa es compatible, cambiar los existentes exige subir `version` con migración.
- Ningún texto visible escrito a mano en los componentes: todo pasa por `t()`, en inglés y en español.
- Plantillas: JSON validado con Zod y guardado en local; cuando llegue el login real, se sincronizan con Supabase (requisito firme, ver `docs/decisions/003-accounts-and-templates.md`).
- Funciones de `core/` que corren en gestos (p. ej. `photo-framing.ts`): llevan la directiva `'worklet'` (es solo un string, siguen siendo puras) y sus helpers van definidos antes que quien los usa, porque el plugin de worklets las convierte en variables y pierden el _hoisting_.
- Editor: lo que se puede deshacer es un `EditorDocument` (plantilla + encuadre) dentro de un `History` (`core/history.ts`), con un paso por gesto o cambio. Durante un gesto el valor vive en un _shared value_ en el hilo de UI y solo se confirma al soltar (`scheduleOnRN`), nunca un `setState` por fotograma. La capa arrastrada se dibuja desde el _shared value_ solo mientras se arrastra; empezar y terminar el arrastre va en la misma actualización de React que la selección o el commit, para que nunca se vea un fotograma con una transformación vieja. Medidas, toques e imantado salen de `prepareLayers` (`editor/template-scene.tsx`) y `core/layer-transform.ts`. La foto siempre cubre el marco, también girada: nunca quedan esquinas vacías (decisión de producto; Instagram sí las deja y es difícil volver a encuadrar).
- Fotos: Skia dibuja una copia de editor (≤ 2048 px) y se prepara en segundo plano una de exportación (≤ 4096 px, calidad máxima); el encuadre va en proporciones. Detalle y alternativas en `docs/decisions/004-photo-loading.md`.
- Hitos: 1 esqueleto · 2 núcleo con fixtures · 3 editor · 4 Strava real + Supabase · 5 profundidad (módulo nativo, _development build_) + Sentry + TestFlight, y probar ahí la decodificación nativa de fotos directa a la GPU (ADR 004). El vídeo resumen va después del MVP.
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
