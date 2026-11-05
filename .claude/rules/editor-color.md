---
paths:
  - 'src/editor/{color-menu,eyedropper,photo-color}*'
  - 'src/core/{color-menu,design-background,dominant-color}*'
---

# Editor: fondo, menú de color y cuentagotas

- Fondo (`core/design-background.ts`), donde la foto deja hueco o sin foto: `auto` es el color dominante de la foto, con su opacidad opcional (MMCQ en `core/dominant-color.ts`, leído una vez por imagen de una copia de 64 px en `editor/photo-color.ts`; sin foto, nada, así que el menú solo ofrece «Transparente», marcado), un color (con su opacidad como `#RRGGBBAA`: translúcido, la imagen sale en PNG y en pantalla se ve el damero debajo), o transparente.
- Menú de color (ADR 009, `editor/color-menu.tsx` y `core/color-menu.ts`), el mismo para widgets y fondo: rejilla de 12×10 como la de AURA (grises de blanco a negro y doce tonos en nueve claridades, generada en HSL; sin espectro ni reguladores para el color), barra de opacidad (del 10 %, en su extremo izquierdo, al 100 %: nada desaparece del todo; el lienzo dibuja el widget o el fondo desde un _shared value_ mientras se arrastra y la confirma al soltar), y una fila con el cuentagotas, las casillas especiales del fondo, los colores de la marca (Track Red, Night Ink, Chalk, siempre) y los favoritos del usuario, que se guardan en el teléfono (`data/color-favorites.ts`, un JSON; «+» añade el color elegido y una pulsación larga quita uno).
- Cuentagotas (`editor/eyedropper.tsx`): toma una sola captura del diseño al abrirse (la imagen exportada, con los widgets y su transparencia real: `eyedropper-snapshot.tsx`, probada con CanvasKit), aparta los controles (el lienzo baja si estaba subido) y muestra una lupa que el dedo mueve desde cualquier punto del lienzo sin taparla. La lupa solo se mueve con transformaciones animadas (sus recortes son fijos alrededor de su centro), amplía 6 veces, y su aro es el color del píxel central; donde el diseño es transparente se ve el damero y al soltar no cambia nada (no se copia el gris del damero); en un fondo translúcido coge su color propio. Se aplica al soltar (un paso), y la captura se libera con `disposeLater`.
