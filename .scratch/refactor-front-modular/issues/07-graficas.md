# 07: Gráficas

**What to build:** Las gráficas SVG y su actualización pasan a módulos propios. Es la sección más grande del script, así que puede dividirse en varios módulos por tipo de gráfica.

**Blocked by:** 04

**Status:** done

- [x] Cada tipo de gráfica vive en un módulo identificable
- [x] La suite de pruebas del front pasa completa
- [x] Todas las gráficas se ven iguales y los tooltips funcionan

## Comments

Las gráficas salieron de `app.js` a `js/`: `grafica-tooltip.js`, `grafica-base.js` (`FORMATOS`, colores por entidad, `escalaTexto`, `svgEl`), `grafica-registro.js` (`registrarGrafica`, `ajustarGraficasVisibles`), un módulo por tipo (`grafica-barras-simple.js`, `grafica-barras-agrupadas-horizontal.js`, `grafica-barras-agrupadas-vertical.js`, `grafica-barras-apiladas.js`, `grafica-linea.js`) y, para la actualización del Inicio, `graficas-inicio.js` (`actualizarGraficas`), `semaforo-proyectos.js`, `resumen-pm.js` y `tabla-no-iniciados.js`. Además `chip.js` (`chip`, que usan el resumen de PM, la tabla y las vistas que siguen en `app.js`). Funciones movidas tal cual; `tabla-no-iniciados.js` abre el detalle por `vistas.abrirDetalle`.

`graficaQueCambio` (controlador de la gráfica de cambios) se actualiza al repintar desde `registrarGrafica`, así que vive en `grafica-registro.js` y `app.js` lo usa con `graficaQueCambioActual()` / `fijarGraficaQueCambio()`.

Se dejaron en `app.js`: `crearGraficaRevenueProyecto` (solo la usa el detalle, ticket 08) y `pintarProyeccionBacklogRevenue` (solo trazabilidad, ticket 09).

Notas: `crearGraficaBarrasAgrupadasVertical` no la llama nadie (código muerto ya en el original); se movió igual y no entra al grafo de módulos. Prueba nueva de estructura en `forecast-modulos.test.js`. `comparar.sh` sale en 0.
