# 05: Filtros

**What to build:** Rango Desde/Hasta, territorio, estado, Semáforo y Handover viven en su propio módulo, separados de las gráficas y del listado.

**Blocked by:** 04

**Status:** done

- [x] Cambiar un filtro no requiere tocar código de gráficas
- [x] La suite de pruebas del front pasa completa
- [x] Los filtros funcionan igual en el navegador, incluido el rango por URL

## Comments

Los filtros salieron de `app.js` a cuatro módulos en `js/`: `filtros.js` (reglas puras: `DIMENSIONES`, `SIN_DATO`, `valorDimension`, `pasaDimension`, `pasaTexto`, `pasaTerritorio`, `pasaVisibilidadProyecto`, `conteosDe`, `opcionesDe`), `filtros-ui.js` (`aplicarFiltros`, dropdowns, chips, territorio, limpiar, completados/cancelados), `selector-forecast.js` (rango Desde/Hasta y URL) y `selector-periodo.js` (selector de periodo de revenue; separado para evitar un ciclo con `filtros-ui.js`). Funciones movidas tal cual.

Las vistas que siguen en `app.js` (`actualizarUI`, `renderizarDetalle`, `renderizarTrazabilidad`, `renderizarPMs`) llegan por `js/vistas.js`: `app.js` las registra al cargar con lambdas que se resuelven al llamar, así que las pruebas que reemplazan esos nombres en el ámbito unido siguen funcionando sin tocar nada. Cuando esas vistas se muevan, basta registrarlas desde su módulo o importarlas directo.

Quedó en `app.js`: `claveProyecto` y `clavesProyectosOcultos` (dependen de `backlogDe`; no son reglas de filtro). Sin cambios en pruebas; `comparar.sh` sale en 0.
