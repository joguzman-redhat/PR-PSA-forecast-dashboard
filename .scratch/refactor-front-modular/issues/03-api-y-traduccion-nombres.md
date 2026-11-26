# 03: Acceso a la API y capa de traducción de nombres

**What to build:** La carga de datos y la conversión de nombres antiguos al vocabulario del glosario quedan en un solo módulo. Es el único lugar del front que conoce nombres como valor_of, acumulado_a_hoy o corte.

**Blocked by:** 02

**Status:** done

- [x] Ningún otro módulo usa nombres antiguos, solo vocabulario de GLOSSARY.md
- [x] La suite de pruebas del front pasa completa
- [x] El dashboard muestra las mismas cifras que antes

## Comments

Se creó `js/api.js` con `obtenerTimeline()` (el `fetch` a `./api/timeline` y el error de respuesta) y `traducirFilaBacklog()`, que renombra en sitio los campos de dinero de las filas de backlog: `valor_of` -> `booking`, `acumulado_a_fecha` -> `ejecutado`, `total_ejecutado_acumulado` -> `proyectado`, y `acum_2025` -> `acumulado_anterior` (alias antiguo). `cargarDatos` sigue en `app.js` (toca el calendario y la UI) y llama a `obtenerTimeline()`. Se actualizaron los lectores en `app.js` y una línea de preparación de `forecast-ui.test.js` que escribía una fila directa en `ui.estado` (sin cambiar aserciones). Prueba nueva: solo `js/api.js` conoce esos nombres.

Quedó sin traducir, para tickets siguientes:
- `acumulado_anterior`: no es término prohibido (el glosario lo usa para definir Ejecutado); se lee en ~6 sitios. Si se quiere otro nombre, hacerlo en `traducirFilaBacklog`.
- Ids de columna de las tablas (`valor_of`, `acumulado_a_hoy`, `consumido_2025`, `backlog_2026`, `valor_of_anterior`, `diferencias_acumulado_of`...) en `app.js` (~líneas 669-680, 1113-1150, 1294-1296, 2750): son claves de la API de Info Proyectos y de la configuración de columnas, mezcladas con etiquetas; moverlas toca el módulo de tablas.
- Filas de `proyectos` (Info Proyectos) no se traducen: el dinero solo se lee de backlog.
- Comentarios de `app.js` que citan `p.valor_of`/`acumulado_a_hoy` de Info Proyectos y "corte" (vocabulario de otros tickets).
