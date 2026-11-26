# 09: Trazabilidad global y comparación de Snapshots

**What to build:** La vista de trazabilidad global y la comparación de Snapshots pasan a módulos. Todo texto y nombre usa Snapshot, nunca corte.

**Blocked by:** 07

**Status:** done

- [x] La comparación de dos Snapshots muestra los mismos cambios que antes
- [x] La suite de pruebas del front pasa completa
- [x] No queda la palabra corte en nombres ni en código nuevo

## Comments

La trazabilidad global, la comparación de Snapshots y la vista de PMs salieron de `app.js` a `js/`: `trazabilidad-global.js` (`renderizarTrazabilidad`, `mesesVisiblesPorSnapshot`), `trazabilidad-backlog-revenue.js` (gráfica Backlog vs. Revenue y `pintarProyeccionBacklogRevenue`), `opciones-filtro.js`; comparación: `snapshots-rango.js`, `snapshots-cambios.js` (`calcularCambios`, `direccionDe`), `snapshots-kpis.js`, `snapshots-grafica-cambios.js`, `snapshots-movimientos.js` (tabla de eventos y su orden), `snapshots-resumen-proyectos.js` (resumen y detalle de movimientos); PMs: `pms-calculo.js`, `pms-vista.js`, `pms-proyectos.js`. `clavesProyectosOcultos` pasó a `clave-proyecto.js`. Funciones movidas tal cual; `irAProyectosDePM` cambia de pestaña por `vistas.cambiarPestana`. `app.js` conserva `renderizarTrazabilidad`/`renderizarPMs` registradas con lambdas (las pruebas las reemplazan).

Renombres por Snapshot: la variable local `corte` de `rangoPredefinido` pasó a `limite` y se corrigió un comentario; ningún texto visible del código movido decía "corte", así que no hay nada que anotar para el ticket de cierre. Prueba de estructura nueva en `forecast-modulos.test.js` (incluye que estos módulos no contengan "corte"). `comparar.sh` sale en 0 (0 diferencias en 4 vistas); `npm test` 67/67.
