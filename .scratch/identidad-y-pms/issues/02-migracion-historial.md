# 02: Migración del historial

**What to build:** una migración en `infra/db/migraciones/` (con su cambio equivalente en `01_schema.sql`) que reconstruye las claves del historial ya guardado, para que los proyectos partidos queden unidos con sus series y Snapshots. Es idempotente. Se documenta el `pg_dump` previo y se aplica solo en la base local; OpenShift queda fuera. Se miden las cifras antes y después con los datos reales.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Prueba (seam 1): una base con claves partidas queda unida tras la migración, con su historial completo
- [ ] Prueba: correr la migración dos veces deja los mismos datos
- [ ] Documentado: `pg_dump` antes de aplicarla, base local primero, OpenShift después
- [ ] Datos reales, antes y después: las series pasan de 349 a 348 claves y PR-061990 y PA 69412 quedan como un solo proyecto con su historial
- [ ] Booking, Ejecutado y Backlog totales no cambian
- [ ] `npm test` pasa
