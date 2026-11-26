# 13: Backlog de toda la vida, Ejecutado y Proyectado

**What to build:** Cada proyecto muestra un solo Backlog tomado de la Carga más reciente, que cubre toda la vida restante incluido 2027, y las métricas Ejecutado y Proyectado sobre toda la vida. La proyección usa solo Commit (ADR 0001). Pruebas primero.

**Blocked by:** 12

**Status:** done

- [x] El Backlog no se suma entre años y el Booking se cuenta una sola vez
- [x] Proyectado es Ejecutado más el Commit de los meses futuros, sin Upside
- [x] Un Commit registrado en febrero de 2027 descuenta el Backlog en la gráfica y en Proyectado
- [x] Un mes sin cobertura permanece como sin dato, no como cero

## Comments

Hecho con pruebas primero (`infra/api/test/forecast-proyectado.test.js`, 9 pruebas, en rojo antes de implementar). Cambios: `js/fila-backlog.js` (nuevo; `backlogDe` y `normalizarNombre` salen de `dinero-proyecto.js` para evitar un ciclo con `vida-proyecto.js`), `dinero-proyecto.js` (Ejecutado y Proyectado sobre toda la vida, `arrastreProyecto`, `commitPosteriorAlAnioFuente`, `resumenFinanciero.backlogSinPlanear`), `series-revenue.js` (reutiliza `arrastreProyecto`; nota de la curva), KPIs, encabezado del detalle (nueva cifra Proyectado) y etiqueta "Proyectado" en `index.html` y en las gráficas de comparación. Endpoints, API, esquema y n8n sin tocar.

Relación entre cifras: el Backlog de la fuente (Excel más reciente) es Booking − acumulado anterior − Commit de los 12 meses del Año fuente. Por eso el Commit de años posteriores todavía no está descontado. Se definió Backlog sin planear = Backlog de la fuente − Commit posterior al Año fuente, y la identidad Booking = Ejecutado + Commit pendiente + Backlog sin planear. Con datos reales cuadra a cero en los 331 proyectos con cifras completas; los 17 sin fila de BackLog NOLA siguen sin dato, así que el KPI "Diferencia vs. Booking" sigue en "—" como antes.

Interpretaciones tomadas sin que fueran explícitas (revisar):
1. El KPI Backlog y la columna Backlog siguen mostrando el Backlog de la fuente sin descontar (regla "es la columna del Excel"). El descuento por Commit de 2027 se ve en Proyectado, en la curva del detalle y en `backlogSinPlanear` (solo en el cálculo de la diferencia).
2. Ejecutado ya no lee `acumulado_a_fecha` de la API: se calcula (acumulado anterior + Commit hasta el mes de `fecha_referencia`). Si no se puede calcular (faltan meses o no hay meses), se usa la columna de la fila solo mientras el mes actual siga dentro del Año fuente; si no, sin dato. En datos reales coincide con la API en los 348 proyectos.
3. El Proyectado ya no lee `total_ejecutado_acumulado`; es Ejecutado + Commit de todos los meses posteriores al actual que tengan dato.
4. Cobertura exigida para no marcar sin dato: todos los meses futuros desde enero del Año fuente hasta el mayor entre diciembre del Año fuente y el fin de la vida (Fecha fin, o el último mes con Commit). Si falta uno, Proyectado y Commit pendiente quedan sin dato, nunca cero. Meses futuros posteriores a ese límite se suman solo si traen dato.
5. Un Commit posterior a la Fecha fin se suma al Proyectado (historia 19: no se recorta). La advertencia visible no se añadió aquí.
6. Si el mes actual pasa a 2027 con fuente FY26, el Backlog sin planear descuenta todo el Commit posterior al Año fuente (también el ya ejecutado), para que la identidad siga cerrando.
7. La curva "Saldo contractual / Revenue acumulado" ya cubría toda la vida y no cambió de cálculo; solo se amplió su nota (Ejecutado hasta hoy, Proyectado después, sin Upside). Sus etiquetas y las de otros textos con "corte"/"Saldo contractual" quedan para el ticket 15.
8. Etiquetas cambiadas porque su cálculo cambió: KPI "Acumulado proyectado" -> "Proyectado"; series "Ejecución proyectada" -> "Proyectado"; ayudas de Revenue acumulado, Commit pendiente, Proyectado y Diferencia. "Commit pendiente del año" conserva su etiqueta (ahora cubre toda la vida; revisar en el 15). `proyectadaAnio` se renombró `proyectadoProyecto` (mapeado en `pagina-simulada.js`).

Pruebas existentes cambiadas (deliberado y mínimo):
- `forecast-caracterizacion.test.js`, "Ejecutado y el Proyectado de cierre se leen de la fila...": `proyectadaAnio(p)` esperado 906994 (columna de la API) -> null (sin meses no hay Proyectado; la API ya no se lee). Título ajustado.
- `forecast-ui.test.js`, "proyectado más Backlog explica Booking...": los valores esperados no cambian (730, 30, 0, 20, null); solo la preparación borra `2027-01_fijo` y `2027-12_fijo` del fixture, que ahora dejarían meses de 2027 sin dato.

Riesgos: no se reconstruyó la imagen de la API (`./forecast.sh rebuild` pendiente de operación); la auditoría de cifras de /tmp/forecast-audit compara con el cálculo viejo del Proyectado y de Commit pendiente, habrá que regenerar su línea base.
