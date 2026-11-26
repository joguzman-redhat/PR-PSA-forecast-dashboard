# 08: Vista de detalle del proyecto

**What to build:** El detalle de proyecto y su gráfica de Backlog vs. revenue pasan a módulos.

**Blocked by:** 07

**Status:** done

- [x] El detalle se ve igual y conserva toda la vida disponible del proyecto
- [x] La suite de pruebas del front pasa completa
- [x] La navegación al detalle y de vuelta funciona

## Comments

El detalle salió de `app.js` a `js/`: `detalle.js` (`abrirDetalle`, `renderizarDetalle`, que orquesta y arma la información plegable), `detalle-encabezado.js`, `detalle-hermanos-cliente.js`, `detalle-grafica-revenue.js` (Commit y Upside apilados) y `detalle-trazabilidad-proyecto.js`. Funciones movidas tal cual. `renderizarTrazabilidadProyecto` se quedó con el detalle (solo la llama `renderizarDetalle` y pinta el pie de cada proyecto); la vista global y la comparación de Snapshots (ticket 09) siguen en `app.js`.

Para evitar ciclos: `claveProyecto` pasó a `js/clave-proyecto.js` y `MINIMO_CAMBIO` a `js/umbral-cambio.js` (los comparte con la trazabilidad global). Los hermanos abren detalle por `vistas.abrirDetalle`, y `abrirDetalle` cambia de pestaña por `vistas.cambiarPestana`, registrada desde `app.js` junto con `renderizarDetalle`/`abrirDetalle`. `comparar.sh` sale en 0; `npm test` 66/66. Navegación revisada por lectura: listado, hermanos, trazabilidad global y tabla de no iniciados llaman `vistas.abrirDetalle`/`abrirDetalle`, que fija `estado.proyectoSeleccionado` y `cambiarPestana('detalle')`; el hash `#detalle/<pa>` y volver a otras pestañas siguen en `cambiarPestana`.

Pendiente: `clavesProyectosOcultos` sigue en `app.js`; vocabulario como "Saldo contractual" y "vigencia" en textos del detalle se movió sin cambios.
