# 02: Migración del historial

**What to build:** una migración en `infra/db/migraciones/` (con su cambio equivalente en `01_schema.sql`) que reconstruye las claves del historial ya guardado, para que los proyectos partidos queden unidos con sus series y Snapshots. Es idempotente. Se documenta el `pg_dump` previo y se aplica solo en la base local; OpenShift queda fuera. Se miden las cifras antes y después con los datos reales.

**Blocked by:** 01

**Status:** done

- [x] Prueba (seam 1): una base con claves partidas queda unida tras la migración, con su historial completo
- [x] Prueba: correr la migración dos veces deja los mismos datos
- [x] Documentado: `pg_dump` antes de aplicarla, base local primero, OpenShift después
- [x] Datos reales, antes y después: las series pasan de 349 a 348 claves y PR-061990 y PA 69412 quedan como un solo proyecto con su historial
- [x] Booking, Ejecutado y Backlog totales no cambian
- [x] `npm test` pasa

**Nota:** aplicada el 2026-11-26 en la base local (`forecast-postgres`) con `pg_dump` previo en `~/forecast_antes_identidad.dump`. Antes y después, con datos reales:

- Series del timeline: 349 a 348. Proyectos en la API: 348 a 348.
- PR-061990 y PA 69412 son un solo proyecto, `PR:PR-061990`, con 24 meses de historial.
- Booking $37.728.928, Backlog $9.690.708, acumulado anterior $6.511.663 y suma de Commit $22.741.182: sin cambio.
- La migración borró 8.376 filas de `forecast_revenue_mensual` y reinsertó 8.352: las 24 de diferencia eran meses duplicados del proyecto partido.
- Claves `PA:PR-…` que quedan: 0. `proyecto.clave` se reescribió en 348 de 349 filas; la restante conserva su clave vieja (clave duplicada, ver ADR 0003).
- Falta reconstruir la imagen de la API y reiniciarla: el contenedor `forecast-api` corre una versión anterior al cambio de identidad.
