# 02: Consultar el dashboard interno con Postgres

**What to build:** Desplegar manualmente dashboard/API y Postgres persistentes en runtime-int con esquema inicial controlado, acceso de lectura corporativo y aislamiento desde el primer arranque. El dashboard sin histórico muestra su estado vacío real.

**Blocked by:** 01.

**Status:** ready-for-agent

- [ ] Empaquetar módulos ES y CSS actuales, sin activar demo.
- [ ] Inicialización y migraciones registradas sin reaplicar cambios absorbidos por el esquema inicial.
- [ ] Vida API independiente de Postgres; readiness adecuada.
- [ ] Imagen identificable, UID arbitrario, almacenamiento persistente y mínimos privilegios.
- [ ] Solo dashboard/endpoints de lectura accesibles por ingress interno verificado; Postgres interno y operaciones administrativas inaccesibles a lectores.
- [ ] Verificar respuestas observables sin una base temporal nueva.

## Comments

Spec: [Despliegue oficial](../spec.md).
