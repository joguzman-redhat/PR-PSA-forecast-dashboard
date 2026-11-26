# 06: Listado de proyectos y columnas redimensionables

**What to build:** La tabla del listado y el redimensionado de columnas pasan a módulos.

**Blocked by:** 05

**Status:** done

- [x] El listado se ve y se ordena igual que antes
- [x] La suite de pruebas del front pasa completa
- [x] Las columnas siguen siendo redimensionables

## Comments

La tabla del listado salió de `app.js` a `js/listado-proyectos.js` (`abrirLecturaEstatus`, `renderizarTabla`, `ordenarTabla`) y el redimensionado a `js/columnas-redimensionables.js` (anchos en localStorage, `asegurarResizers`, `setupMutationObserver` y los listeners delegados de arrastre, doble clic y supresión de clic). Funciones movidas tal cual. Además `js/campos-proyecto.js` recibe `CAMPOS_DINERO/PORCENTAJE/ID`, `identificador` y `claseVencimiento`, que usan el listado y también el detalle y otras vistas de `app.js` (así no se duplican). Abrir el detalle (aún en `app.js`) llega por `vistas.abrirDetalle`, registrada en `app.js` con una lambda, igual que las demás vistas.

Los listeners globales de arrastre ahora se registran al evaluar `columnas-redimensionables.js` (antes, al evaluar `app.js`); `app.js` sigue llamando a `cargarAnchosDeStorage`, `asegurarResizers` y `setupMutationObserver` en el mismo punto del arranque.

Prueba de forma de módulos: se exceptuó `listado-proyectos.js` y `campos-proyecto.js` de la regla "solo api.js conoce `valor_of`" porque esos ids son claves de columnas de Info Proyectos (ver ticket 03); se añadió una prueba de la nueva estructura. `comparar.sh` sale en 0; `npm test` 64/64.
