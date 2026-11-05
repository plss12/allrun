---
paths:
  - 'src/sources/**'
  - 'src/data/**'
  - 'src/core/{sports,dates,route-privacy,template,phrases}*'
  - 'src/ui/today*'
  - 'supabase/**'
---

# Datos y plantillas

- Strava: datos bajo demanda y caché local de menos de 7 días; el trazado llega completo al dueño, y el recorte de privacidad del inicio y del final viene desactivado por defecto (decisión del usuario): será un ajuste del perfil, guardado con la cuenta (`SUGGESTED_PRIVACY_TRIM_METERS`). De Strava solo se usan los logos oficiales «Powered by Strava» / «Compatible with Strava», sin modificar; por decisión de producto, el editor solo ofrece el logo de AllRun.
- Datos de ejemplo siempre sintéticos (`generateStravaFixtures`, con semilla fija): el repo es público y las actividades reales revelarían dónde vive el usuario.
- Cualquier `sport_type` de Strava tiene que funcionar. Deporte en dos niveles (`core/sports.ts`): la modalidad decide las métricas (`core/metrics.ts`), la familia agrupa para los resúmenes y los filtros (`SPORT_FAMILIES`: carreras, ciclismo, caminatas, natación, entrenos y otros); lo desconocido cae en `other`, el perfil genérico. «Otros» solo aparece si el usuario tiene alguna.
- Fechas: los periodos se agrupan por fecha local (`LocalDate`, `YYYY-MM-DD`) con aritmética de días en `core/dates.ts`, sin librerías de fechas ni `Date` local, salvo en la frontera con la plataforma (reloj y selector de fechas nativo: `ui/today.ts`).
- Versículos, citas y frases de chat: datos de una tabla de Supabase con sus dos idiomas por fila (`core/phrases.ts`, ADR 012), con copia local (`data/phrases.ts`, `phrases-table.ts`). El proyecto de Supabase lo edita el dueño en su panel. Versículos solo de traducciones de dominio público (WEB, KJV, Reina-Valera 1909): NIV y RV1960 tienen derechos.
- Los formatos del lienzo son fijos (decisión del usuario): 9:16, 3:4, 4:5, 1:1 y 1,91:1.
- Plantillas (`core/template.ts`, versión 2): formato + capas ligadas a datos, con posiciones relativas (0..1), dónde va la foto (`photo`, relativa al lienzo), el fondo (`background`) y, opcionales, la unidad (`units`) y el idioma de los widgets (`language`: `es` o `en`) del diseño; sin ellos, los del teléfono y la app. Las de versión 1 se migran solas (foto cubriendo, fondo `auto`). Se crean con `newTemplate`. Hay capas solo de actividad y solo de resumen; añadir tipos de capa o campos opcionales es compatible, cambiar los existentes exige subir `version` con migración.
- Plantillas del usuario: JSON validado con Zod y guardado en local, sin nombre, por formato y modo (`TemplateStore`); cuando llegue el login real, se sincronizan con Supabase (requisito firme, ver `docs/decisions/003-accounts-and-templates.md`).
