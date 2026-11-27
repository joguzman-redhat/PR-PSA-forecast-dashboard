# 06: Revisión de las demás pantallas con datos reales

**What to build:** un informe corto en `.scratch/identidad-y-pms/` que compara KPIs, listado, detalle e informe PDF con los datos reales, con la misma técnica usada con los PMs (el front real cargado con la respuesta de `/api/timeline`, solo lectura). Lista cada desajuste de dinero entre pantallas, con un proyecto de ejemplo y su causa, y concluye si hace falta el módulo de dinero por proyecto (candidato 1) o no. Este ticket no cambia código.

**Blocked by:** 02, 03, 04, 05

**Status:** ready-for-human

- [x] El informe compara KPIs, listado, detalle e informe PDF, con cifras reales
- [x] Cada desajuste trae un proyecto de ejemplo, su causa y cuántos proyectos afecta
- [ ] El informe concluye con una recomendación sobre el módulo de dinero, que decide el usuario

**Nota:** informe en `.scratch/identidad-y-pms/informe-revision-pantallas.md`. Recomienda no construir el módulo de dinero por ahora; la decisión final queda pendiente del usuario, por eso el Status sigue en `ready-for-human`.
