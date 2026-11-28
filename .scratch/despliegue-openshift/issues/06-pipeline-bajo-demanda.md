# 06: Actualizar la aplicación mediante un pipeline bajo demanda

**What to build:** Ejecutar un commit autorizado de main a través de verificaciones, build, publicación trazable, migraciones pendientes, rollout y comprobación HTTP. Conservar datos y configuración. La activación inicial es manual.

**Blocked by:** 04.

**Status:** claimed

- [ ] Suite existente y lint front compatibles con el entorno; no base temporal ni pruebas destructivas oficiales.
- [ ] Construcción en ubicación soportada y publicación en registro corporativo.
- [ ] Commit validado y digest desplegado; promociones serializadas y protección frente a entregas antiguas.
- [ ] Migraciones pendientes una sola vez, exclusión mutua, errores detienen rollout.
- [ ] No actualizar motores ni sobrescribir configuración n8n.
- [ ] Logs consultables y reversión API compatible con esquema documentada.

## Comments

Spec: [Despliegue oficial](../spec.md).

## Actualización verificada

Pipeline forecast-build-push-9kk6r Succeeded: commit a1a87c7, 123 tests/lint/build/push. Se promovió manualmente digest compartido API/migraciones; Job completó antes del rollout, salud/conciliación aprobadas. Falta integrar promoción serializada automática mediante Git/Argo; no se declara CD completo.

Evidencia: [Estado del despliegue](../../../openshift/ESTADO-DESPLIEGUE.md).
