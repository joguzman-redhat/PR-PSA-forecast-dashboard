# 14: Fecha fin en gráficas y proyección

**What to build:** Con Fecha fin, las gráficas y la proyección llegan hasta ella aunque el último Commit sea anterior. Sin Fecha fin, queda vacía y la vida llega al último mes con Commit, sin inventar fechas. Un Commit posterior a la Fecha fin se advierte sin borrar ni recortar el importe.

**Blocked by:** 13

**Status:** done

- [x] Un proyecto con Fecha fin muestra la gráfica hasta ese mes
- [x] Un proyecto sin Fecha fin sigue sin Fecha fin
- [x] Un importe posterior a la Fecha fin muestra advertencia y no se recorta

## Comments

Hecho con pruebas primero (`infra/api/test/forecast-fecha-fin.test.js`, 7 pruebas; 3 en rojo antes de implementar). Revisado el código: con Fecha fin, `calendarioVidaProyecto` ya llegaba hasta ella (curva del detalle, barras, Proyectado y mes sin cobertura ya cumplían; quedan cubiertos por pruebas). Lo que faltaba: un Commit o Upside posterior a la Fecha fin quedaba fuera del calendario (se recortaba de la curva y las gráficas, aunque el Proyectado sí lo sumaba) y no había advertencia visible. Cambios: `js/vida-proyecto.js` (`vidaProyecto` expone `mesesPosterioresAFin`, `commitPosteriorAFin`, `upsidePosteriorAFin`; `calendarioVidaProyecto` llega al mes más tardío entre Fecha fin y el último importe; nueva `advertenciaFueraDeFechaFin`), `js/detalle.js` (aviso visible bajo la nota de Fecha fin, reemplaza el texto genérico), `css/13-detalle-proyecto.css`. `fueraDeVigencia` se conserva (contrato de pruebas).

Interpretaciones tomadas sin que fueran explícitas (revisar):
1. Con Commit posterior a la Fecha fin, la curva y las barras del detalle se extienden hasta el último mes con Commit o Upside, no solo con Commit. Sin Fecha fin, el Upside no alarga la vida (solo el Commit).
2. Si la Fecha fin es posterior a la cobertura cargada (después de dic 2027), la curva llega hasta ella con "sin dato" desde el primer mes sin cobertura y el Proyectado queda sin dato; no se rellena con ceros.
3. La gráfica de Backlog vs revenue de la trazabilidad (modo timeline) suma Commit/Upside por mes del rango elegido; no se acota por la vida de cada proyecto, así que ya no recorta nada. No se cambió.
4. Se cambió una línea de `forecast-ui.test.js` ("detalle conserva toda la vida..."): con Commit de 999999 en jul 2027 posterior a la Fecha fin (jun 2027) esperaba saldo 400 (recortado); ahora -999599, por la regla nueva. Es la única aserción modificada.
5. Texto de la advertencia: "Commit posterior a la Fecha fin (mes): Commit de $X en mes. El importe se conserva en el Proyectado y en las gráficas; revisar la Fecha fin." (con Upside agrega "Upside de $Y").
6. No se tocó `pasaPeriodoProyecto` (el filtro por rango sigue ocultando proyectos cuya Fecha fin es anterior al rango aunque tengan Commit posterior; pendiente de decisión). Texto "vigencia válida" de la nota de la curva queda para el ticket 15.

Auditoría de cifras (`audit-rendered-data.cjs`): `timeline.json` bajado de :3000 (idéntico al anterior), `pantallas.json` reconstruido con Chrome sobre :3100 (pantalla, rango 2026-10..2027-12, fy27, PMs) e incluye ahora Commit pendiente, Proyectado, Upside y Diferencia. Expectativas nuevas calculadas dentro del script con la fórmula del ADR a partir de `timeline.json`, sin funciones del front: Ejecutado, Commit pendiente, Proyectado, Backlog sin planear, calendario y curva de saldo por proyecto, advertencias. Resultado: `{"casos":{"conFinPosteriorAlUltimoCommit":160,"sinFin":0,"commitPosteriorAFin":15},"checks":215385,"issues":[],"failures":0}`. En datos reales no hay proyectos sin Fecha fin que tengan Commit (los 17 sin Fecha fin son PR sin Commit), así que ese caso solo lo cubren las pruebas.
