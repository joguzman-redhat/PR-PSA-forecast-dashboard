# 02: Migración del historial

**What to build:** una migración en `infra/db/migraciones/` (con su cambio equivalente en `01_schema.sql`) que reconstruye las claves del historial ya guardado, para que los proyectos partidos queden unidos con sus series y Snapshots. Es idempotente. Se documenta el `pg_dump` previo y se aplica solo en la base local; OpenShift queda fuera. Se miden las cifras antes y después con los datos reales.

**Blocked by:** 01

**Status:** ready-for-agent

- [x] Prueba (seam 1): una base con claves partidas queda unida tras la migración, con su historial completo
- [x] Prueba: correr la migración dos veces deja los mismos datos
- [x] Documentado: `pg_dump` antes de aplicarla, base local primero, OpenShift después
- [ ] Datos reales, antes y después: las series pasan de 349 a 348 claves y PR-061990 y PA 69412 quedan como un solo proyecto con su historial
- [x] Booking, Ejecutado y Backlog totales no cambian
- [x] `npm test` pasa

**Nota:** falta el criterio de datos reales, antes y después. La migración se probó solo en Postgres temporal (`run-migracion-identidad.cjs`); aplicarla en la base local es decisión del usuario (con `pg_dump` previo, ver `infra/README.md`). Al aplicarla, medir 349 a 348 claves y que Booking, Ejecutado y Backlog totales no cambien, y entonces marcar el criterio y cerrar el Status.
