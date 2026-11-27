# Revisión de las demás pantallas con datos reales (ticket 06)

**Fecha:** 2026-11-26 · **Datos:** `GET /api/timeline` de la base local, tras la migración de identidad y la Ejecución con 363 proyectos · **Método:** el front real cargado con esa respuesta (cargador de las pruebas) y las reglas de dinero aplicadas a la población que muestra el dashboard por defecto: 201 de 363 proyectos (sin Completed ni Canceled). Solo lectura; este ticket no cambia código.

## Resultado

No hay más desajustes de dinero entre pantallas. Las diferencias que existían estaban solo en la tabla de PMs (ticket 05, ya corregido).

| Comprobación | Resultado |
|---|---|
| Ejecutado: tarjeta de KPIs vs. tabla de PMs | $18.096.011 = $18.096.011 |
| Proyectado: tarjeta de KPIs vs. tabla de PMs | $20.332.909 = $20.332.909 |
| Proyectos en la tabla de PMs vs. los que cuentan los KPIs | 201 = 201 |
| Booking = Ejecutado + Commit pendiente + Backlog (ADR 0002), por proyecto | cierra en los 195 con cifras completas; 0 no cierran |
| Curva del detalle: Backlog final vs. Backlog mostrado | 140 comparables, 0 difieren |
| % de ejecución calculado vs. columna del Excel | 0 proyectos con más de 1 punto de diferencia |
| Booking de BackLog NOLA vs. Valor OF de Info Proyectos | 0 proyectos distintos |

Listado, detalle, gráficas de inicio e informe PDF calculan con las mismas funciones de `js/dinero-proyecto.js` que los KPIs, así que cuadran por construcción. Lo verificado arriba es la salida de esas funciones, no el PDF exportado.

## Lo único que no cuadra: 6 proyectos sin cifras

Son 6 filas de Info Proyectos que traen solo un Project ID (sin nombre, estado ni PA en dos casos): PR-051873, PR-054558, PR-059283, PR-059796, PR-060605 y PR-061709. No tienen Booking en BackLog NOLA, así que no se pueden calcular.

- **En pantalla:** la tarjeta «Diferencia vs. Booking» muestra «—» en vez de un número, porque hay proyectos con cifras incompletas (ADR 0002: no se afirma una diferencia mientras falten cifras).
- **No es un fallo del código ni de la identidad:** las 6 filas no tienen datos que cruzar. Conviene revisar si son filas vacías del Excel o proyectos nuevos aún sin backlog.
- Los otros 26 proyectos sin cifras de backlog están Canceled y no entran en la vista por defecto.

## Conclusión sobre el módulo de dinero por proyecto (candidato 1)

Con estos datos no hace falta construirlo ahora. La evidencia que lo justificaba (más desajustes entre pantallas) no apareció. Queda el riesgo de que la regla de dinero se vuelva a calcular por otra vía; la regla de `CODING_STANDARDS.md` («ninguna cifra se recalcula por otra vía») y el script `scripts/cifras-reales.cjs` lo cubren por ahora. **Decisión del usuario.**

## Límites de esta revisión

- Solo la población por defecto (201 proyectos); no probé otros filtros ni rangos de fechas.
- No exporté el PDF ni miré las pantallas en un navegador; revisé las cifras que calculan.
- El cruce entre hojas se verificó sobre la base ya cargada, no sobre el Excel.
- La API pasó de 348 a 363 proyectos con la última Ejecución; no investigué si son filas nuevas del Excel.
