# 04: Cálculos de dinero, calendario y vida del proyecto

**What to build:** KPIs, periodos, Booking, Ejecutado, Commit, Upside y vida del proyecto pasan a módulos propios, con nombres del glosario y sin cambios de comportamiento.

**Blocked by:** 03

**Status:** done

- [x] Un desarrollador encuentra cada cálculo de dinero en un módulo con nombre claro
- [x] La suite de pruebas del front pasa completa
- [x] Los términos prohibidos del glosario no aparecen en los módulos nuevos

## Comments

Los cálculos salieron de `app.js` a cinco módulos en `js/`: `calendario.js` (meses, periodos, rango, mes de referencia), `dinero-proyecto.js` (Booking, Ejecutado, Backlog, Proyectado, Commit, Upside, resumen financiero), `vida-proyecto.js` (Fecha fin, vida, calendario de vida), `series-revenue.js` (serie de Commit/Upside y serie de saldo) y `kpis.js` (KPIs y textos de ayuda). Funciones movidas tal cual. `MESES_ES` y `PERIODOS` ahora son `const` que `configurarCalendarioTimeline` modifica en sitio (`splice`) dentro de `calendario.js`; los demás módulos solo los leen. Renombres por glosario: `acumuladoHoy` -> `ejecutadoProyecto`, `corteFinanciero` -> `mesReferenciaFinanciera` (mapeados en `pagina-simulada.js`).

Quedan, por ser contrato de pruebas o texto visible: la propiedad `fueraDeVigencia` de `vidaProyecto`, y las claves/textos 'Saldo contractual' de `serieSaldoProyecto`, además de textos de ayuda con "corte"/"vigencia" (ticket de textos).

`proyectado` (campo `total_ejecutado_acumulado`): es la columna del Excel "TOTAL EJECUTADO ACUMULADO" (acumulado anterior + Commit del Año fuente), ya calculada y que llega solo hasta el fin de ese Año fuente, no sobre toda la vida; el ADR 0001 la redefine en la Fase 2. Se dejó el nombre y se anotó en `js/api.js`.

Riesgo: `comparar.sh` no sale en 0 porque su línea base está desactualizada respecto de los datos vivos (348 proyectos vs 347); el DOM del árbol de trabajo es idéntico byte a byte al de HEAD sobre los mismos datos.
