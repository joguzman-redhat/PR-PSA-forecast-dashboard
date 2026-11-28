# 16: Backlog continuo entre años y Proyectado que nunca desaparece

**What to build:** El Backlog que se muestra es el continuo (Backlog de la fuente menos el Commit posterior a su Año fuente), en todos los lugares donde se muestra. El Proyectado nunca queda sin dato por falta de cobertura: se calcula con el Commit que existe y se marca parcial.

**Blocked by:** 15

**Status:** done

- [x] Tarjeta, listado, detalle, tabla/totales de PMs, estadísticas de vendedor/PM e informe muestran el Backlog continuo
- [x] Booking = Ejecutado + Commit pendiente + Backlog cierra con el nuevo Backlog
- [x] Un proyecto sin cifras no cuenta como cero en el Backlog total ni en el % de ejecución
- [x] Proyectado parcial con marca visible; se completa solo al cargarse más Commit
- [x] ADR 0002, REGLAS_DE_DATOS.md y GLOSSARY.md actualizados

## Comments

Hecho con pruebas primero (`infra/api/test/forecast-backlog-continuo.test.js`, 10 pruebas, en rojo antes de implementar). Cambios: `js/dinero-proyecto.js` (`backlogDeLaFuente` es el dato de entrada; `backlogHoy` es el continuo; `coberturaProyectado`, `textoProyectadoParcial`, `sumaConDato`, `ejecucionPonderada`; `resumenFinanciero` devuelve `backlog` continuo, `backlogFuente` y `parciales`, y se retira `backlogSinPlanear`), `kpis.js`, `detalle-encabezado.js` (+ CSS), `graficas-inicio.js`, `pms-vista.js`, `pms-proyectos.js`, `resumen-pm.js`, `reporte-resumen.js`, `index.html` (aviso del KPI Proyectado; `main.js?v=45`). Listado, PMs (`pms-calculo.js`), tabla de no iniciados y curva usan `backlogHoy` y quedan continuos sin tocarlos. Endpoints, API, esquema y n8n sin tocar.

Pruebas existentes cambiadas (valor viejo -> nuevo y razón):
- `forecast-proyectado.test.js`, "un Commit de febrero de 2027 descuenta...": `r.backlog` 620 -> `r.backlogFuente` 620 (el 620 pasó a ser el dato de entrada); `r.backlogSinPlanear` 580 -> `r.backlog` 580; 530 -> `r.backlog` 530. Solo cambia el nombre del campo: el Backlog mostrado es el que antes se llamaba sin planear.
- `forecast-proyectado.test.js`, "la identidad no se fuerza...": `r.backlogSinPlanear` 560 -> `r.backlog` 560 (idem).
- `forecast-proyectado.test.js`, "un mes sin cobertura dentro de la vida...": `commitPendienteProyecto` null -> 30, `proyeccionReferencia` null -> 380, `r.proyectado` null -> 380 (nueva regla: el Proyectado nunca desaparece; Diferencia sigue null y `faltantes` 1). Título ajustado.
- `forecast-fecha-fin.test.js`, "un mes sin cobertura hasta la Fecha fin...": `proyeccionReferencia` null -> 380 (misma razón; la curva y su saldo siguen en null).
- `forecast-caracterizacion.test.js`, "Ejecutado se lee de la fila cuando no hay meses...": `proyectadaAnio` null -> 880000 (sin Commit futuro con dato el Proyectado es el Ejecutado, marcado parcial). Título de otra prueba ("Backlog es la columna del Excel tal cual...") ajustado sin tocar su aserción: solo vale sin Commit posterior al Año fuente.
- `forecast-caracterizacion.test.js`, "Commit pendiente queda sin dato si falta un mes...": `commitPendienteProyecto` null -> 0 y `proyeccionReferencia` null -> igual al Ejecutado (idem). Título ajustado.
- `pagina-simulada.js`: `ui` expone `backlogDeLaFuente`, `coberturaProyectado`, `textoProyectadoParcial`.

Verificación contra el Excel FY27 (BD en solo lectura, API :3000 antes de que los contenedores dejaran de responder): de 348 proyectos en ambas fuentes, 331 tienen cifras y 17 son PR sin BackLog NOLA. Backlog continuo vs. Backlog del Excel FY27: coinciden (±$1) 320 de 331. Las 11 diferencias (PA, continuo, Excel FY27, diferencia; todas menos una explicadas al dólar por el cambio de Booking entre FY26 y FY27): 65837 6.975/8.203 (+1.228, Booking 13.372->14.600); 66859 0/647 (+647, 18.253->18.900); 67099 0/896 (+896, 11.104->12.000); 67634 1.678/6.074 (+4.397, 23.886->28.282); 67912 2.915/7.279 (+4.364, 26.712->31.075); 68335 25.293/35.181 (+9.887, 98.868->108.755); 69117 100.265/76.713 (-23.552, 113.836->90.284); 69122 0/1.962 (+1.962, 7.524->9.486); 69155 65.303/82.920 (+17.617, 65.303->82.920); 69148 90.670/57.625 (-33.045, 155.539->122.494); 69412 81.942/97.460 (+15.518, mismo Booking 124.000, pero el acumulado anterior del FY27 es 0 y el FY26 acumula 15.518 de Commit 2026). Cada una es señal para el negocio.

Antes -> después: PA 66600 $20.996 -> $1.021; PA 68335 $30.592 -> $25.293; PA 65006 $0 -> $0 (sin Commit posterior). Total de Backlog de los 331 proyectos con cifras: 9.690.708 -> 8.476.083; con el rango por defecto (198 proyectos) la tarjeta pasó de $8.39M a $7.17M.

Auditoría (`audit-rendered-data.cjs`): línea base regenerada (`timeline.json` y `pantallas.json` con Chrome sobre :3100), expectativas nuevas calculadas dentro del script sin funciones del front (Backlog continuo, Proyectado parcial, % ejecución con proyectos que tienen ambas cifras, aviso, total de PMs). Resultado literal: `{"casos":{"conFinPosteriorAlUltimoCommit":160,"sinFin":0,"commitPosteriorAFin":15},"checks":215389,"issues":[],"failures":0}`. En datos reales no hay Proyectado parcial (el aviso sale vacío); se probó con una Fecha fin sintética de 2028 en capturas.

Interpretaciones tomadas sin que fueran explícitas (revisar):
1. `backlogHoy` resta el Commit posterior al Año fuente con dato; un mes posterior sin dato resta 0 (no se inventa). Un proyecto sin Backlog de la fuente sigue sin dato.
2. Proyectado parcial = Ejecutado + el Commit futuro que sí existe. Si Ejecutado no se puede calcular (falta un mes pasado) el Proyectado sigue sin dato: lo pasado incompleto es un dato roto, no cobertura futura. Un hueco dentro del rango cargado (no solo después de dic 2027) también marca parcial.
3. Marca visible: aviso bajo la cifra Proyectado del detalle («Proyectado parcial: cubre hasta dic 2027; faltan meses de 2028...») y «Parcial en N de M proyectos» bajo la tarjeta Proyectado. «Hasta» es el mes anterior al primer mes sin cobertura. Commit pendiente se calcula igual y queda parcial, sin marca propia.
4. `faltantes` (cifras incompletas) cuenta también los proyectos parciales, así que la Diferencia vs. Booking se anula si hay alguno (como con cifras incompletas), aunque numéricamente cerraría.
5. % de ejecución (tarjeta, vendedor, PM, informe): Ejecutado / Booking solo de los proyectos con ambas cifras. Totales de Booking/Ejecutado/Backlog: suma de los que tienen dato, y `—` si ninguno (antes `$0`). En la tabla de proyectos del PM un proyecto sin cifra muestra `—` en vez de `$0`. Las gráficas de comparación (cliente/vendedor/proyecto) y ordenamientos siguen contando nulos como cero: no se tocaron.
6. Backlog de la fuente solo se ve en la ayuda de la tarjeta (suma de las fuentes). No se añadió una columna.
7. Se retiró `backlogSinPlanear` (sinónimo de Backlog ahora) y «Backlog sin planear» pasa a _Avoid_ en el glosario. `CLAUDE.md` y `AGENTS.md` decían «el Backlog es la columna del Excel» y se corrigieron.
8. No se pudo ejecutar `/tmp/frontcmp/comparar.sh` (necesita la API real en :3000, que dejó de responder: los contenedores desaparecieron durante la sesión, no por una acción de este ticket). Las capturas se hicieron con un servidor propio en :3100 que sirve el front y el `timeline.json` capturado, sin BD.
