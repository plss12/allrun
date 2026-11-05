---
paths:
  - 'src/app/{_layout,index,select}*'
  - 'src/ui/{launch-screen,top-bar,tabs-layout,card-gradient,text,settings}*'
  - 'src/theme/**'
  - 'src/home/**'
  - 'src/photos/**'
---

# Pantallas: carga, barra superior, inicio y selección

- Pantalla de carga propia (`ui/launch-screen.tsx`): el monograma donde lo pone la splash nativa y el nombre debajo, sobre el fondo de la app (negro, como el inicio y la splash oscura). Las pantallas se montan debajo cuando ya están las caras de Inter de la interfaz y la fuente de iconos (`loadInterfaceFonts`), para que ningún texto salte, y la pantalla sigue mientras cargan las fuentes de Skia (32 ficheros, 5,4 MB, una vez por sesión: `loadEditorFonts`), como mucho 8 s (`MAX_LAUNCH_WAIT_MS` en `app/_layout.tsx`). A la vez, sin retenerla, se decodifican las fotos de stock (`loadStockPhotos`). En Expo Go las fuentes se descargan de Metro por la WiFi y la splash nativa es el icono de la app; en una build instalada se leen del teléfono.
- `ui/top-bar.tsx`: la barra de arriba de inicio y selección, propia de cada pantalla y con un cristal propio: desenfoque con `expo-blur` bajo un degradado translúcido, y en Android solo un gris translúcido más oscuro, porque su desenfoque copia la pantalla en cada fotograma (ADR 014). Nunca un control de SwiftUI en la cabecera nativa: saltaba al entrar, se cortaba y salía duplicado al volver.
- Las pestañas de inicio y de selección, y Recientes, Favoritas y Álbumes, siguen montadas al cambiar (`KeptMounted`): no cargan de nuevo y cada lista sigue donde estaba (decisión del usuario); los resúmenes empiezan a cargar poco después de abrir.
- Tarjetas de listas (`cardSurface` y `CardGradient`, ADR 014): sin sombra difuminada ni `overflow: 'hidden'`, con el degradado pintado una vez en un lienzo, que también lleva la ruta de la tarjeta (línea sólida de 3 pt, sin brillo, decisión del usuario). `removeClippedSubviews` desactivado donde haya lienzos.
- El filtro del inicio es un desplegable propio (`home/sport-filter-menu.tsx`; con un deporte elegido, su botón muestra el icono de ese deporte, decisión del usuario) y no el menú nativo: react-native-screens pone la imagen de una opción cuando termina de cargarla, cuando iOS ya ha construido el menú, y no se ve.
- App siempre oscura (ADR 009): `userInterfaceStyle` en `app.json` y `Appearance.setColorScheme('dark')` en el layout, que es lo que lo aplica en Expo Go. Los colores son los de iOS en oscuro, fijos en todos los teléfonos (`theme/colors.ts`), y no los semánticos ni los dinámicos de Material You, que siguen el fondo de pantalla: así lo que dibuja Skia es del mismo color que el texto de al lado.
- Fotos: `photos/photo-browser.tsx`, en la selección (`app/select.tsx`) y, en una hoja, dentro del editor (`use-photo-picker.tsx`); lee de `data/photo-library.ts`. La pestaña Stickers es `editor/sticker-gallery.tsx`. En Android, Expo Go rechaza a propósito el acceso a las fotos: se prueban en una build propia.
