# 02: Consultar el dashboard interno con Postgres

**What to build:** Desplegar manualmente dashboard/API y Postgres persistentes en runtime-int con esquema inicial controlado, acceso de lectura corporativo y aislamiento desde el primer arranque. El dashboard sin histórico muestra su estado vacío real.

**Blocked by:** 01.

**Status:** needs-info

- [ ] Empaquetar módulos ES y CSS actuales, sin activar demo.
- [ ] Inicialización y migraciones registradas sin reaplicar cambios absorbidos por el esquema inicial.
- [ ] Vida API independiente de Postgres; readiness adecuada.
- [ ] Imagen identificable, UID arbitrario, almacenamiento persistente y mínimos privilegios.
- [ ] Solo dashboard/endpoints de lectura accesibles por ingress interno verificado; Postgres interno y operaciones administrativas inaccesibles a lectores.
- [ ] Verificar respuestas observables sin una base temporal nueva.

## Comments

Spec: [Despliegue oficial](../spec.md).

## Actualización verificada

API/dashboard/Postgres desplegados y actualizados por digest; migraciones controladas, lector sin POST administrativo, salud y conciliación aprobadas. Cinco tablas y 254 filas renderizadas. Resta aislamiento fino de red: internal-1 no se puede restringir con políticas aditivas.

Evidencia: [Estado del despliegue](../../../openshift/ESTADO-DESPLIEGUE.md).
