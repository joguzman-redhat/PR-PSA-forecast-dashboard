# 01: Clave del timeline por Project ID (SQL y API)

**What to build:** `/api/timeline` identifica cada proyecto por su Project ID (ADR 0003). Si falta, usa el PA; si faltan ambos, el proyecto queda «sin identificar» y marcado. Un mismo Project ID con dos PA en una Carga es un solo proyecto: se toma el PA de la fila más reciente y la Ejecución deja un aviso en su log. Se elimina el respaldo por nombre normalizado. Se actualiza `docs/REGLAS_DE_DATOS.md`, que hoy dice que la clave es PA. Pruebas primero, en el seam 1 (contrato de `/api/timeline` sobre Postgres temporal).

**Blocked by:** None (can start immediately).

**Status:** done

- [x] Prueba: el mismo Project ID con distinto PA entre FY26 y FY27 da un solo proyecto en `/api/timeline`
- [x] Prueba: sin Project ID cae al PA; sin ambos queda «sin identificar» y marcado
- [x] Prueba: un mismo Project ID con dos PA en una Carga es un solo proyecto, con el PA de la fila más reciente
- [x] La función SQL de la clave, la clave de la API y `01_schema.sql` aplican la misma regla
- [x] `docs/REGLAS_DE_DATOS.md` describe la nueva regla de identidad
- [x] `npm test` pasa
