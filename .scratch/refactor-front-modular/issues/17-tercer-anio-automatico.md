# 17: Tercer Año fuente automático (2028 sin tocar código)

**What to build:** Que incorporar el Excel del año siguiente (FY28) no requiera cambios de código: el calendario, los selectores Desde/Hasta y el rango por defecto salen de los periodos de la API, los textos no nombran años fijos y el Proyectado se completa solo cuando llega el Commit de 2028. Guía para lo que vive en n8n.

**Blocked by:** 16

**Status:** done

- [x] Auditoría de años fijos en front, API, esquema y workflow de n8n, clasificada (a/b/c)
- [x] Calendario y selectores derivados de `meta.periodos`; rango por defecto hasta el último periodo de la API
- [x] Textos sin años fijos (prueba de guarda sobre `js/`)
- [x] Pruebas con una fuente sintética de tres años (front y API sin BD)
- [x] `docs/NUEVA_FUENTE_ANUAL.md` con el fragmento exacto para n8n

## Comments

Pruebas primero: `infra/api/test/forecast-tercer-anio.test.js` (11, en rojo las del rango por defecto, el calendario de un solo año y la guarda de textos; las de Proyectado/Backlog/Booking verifican la lógica del ticket 16 con tres años y ya cumplían) y `infra/api/test/timeline-tres-anios.test.js` (API sin BD, funciones puras de `timeline.js`: ya era genérica). `pagina-simulada.js`: `datosTimeline(anios = 2)` genera 12 x anios periodos.

Cambios: `js/calendario.js` (se retira la extensión del calendario a `anio+1`; el rango por defecto es del trimestre actual, acotado al calendario, al último periodo de la API), textos en `detalle-encabezado.js`, `kpis.js`, `series-revenue.js`, `dinero-proyecto.js` (sin «2027»), `index.html` (`main.js?v=46`). No se tocaron la API, el esquema ni n8n.

Prueba existente cambiada: `forecast-ui.test.js`, «el rango inicial avanza al cambiar el año...»: `hasta` '2028-12' -> '2027-12' y último periodo '2028-12' -> '2027-12' (la API trae 24 periodos; ya no se inventa un 2028 sin datos); se retira la aserción de que `2028-01` no tiene cobertura (ese periodo ya no existe en el calendario). Título ajustado.

Interpretaciones (revisar):
1. Efecto visible: con datos de solo dos años el calendario termina en dic del último año con Carga, no en dic del año calendario + 1. Hoy, con FY26 y FY27 cargados, es igual. Con solo FY26 cargado ya no se ve un 2027 vacío.
2. El id del DOM `kpi-backlog-2026` se conserva (no se muestra; renombrarlo toca otras pruebas y la auditoría). `estado.forecast.anio: 2026` en `estado.js` es un valor inicial que `carga-datos.js` reemplaza con `anio_actual`.
3. No se escribió migración: el CHECK de `anio_forecast` (2000-2100), las vistas `v_*_timeline` y `forecast_revenue_mensual` ya son genéricas. Los `2026` del esquema son la ruta legacy (carga sin archivo) y el DEFAULT de la columna.
4. `forecast.js` (`/api/forecast/fuentes`) siempre incluye 2026 y 2027 en `anios` y los endpoints antiguos asumen `anio=2026`; el front solo usa `/api/timeline`, se dejaron.
5. Lo único a cambiar en n8n es una línea en el nodo Configurar Fuente Forecast; se verificó con un script desechable que el código real de los nodos Configurar y Normalizar acepta una fuente 2028 con las cabeceras deducidas, y que rechaza una cabecera `BACKLOG 2027` en ella. No se ejecutó el workflow.
6. El agente de IA de n8n (3 tools) es solo FY26 por diseño; no se cambió.
