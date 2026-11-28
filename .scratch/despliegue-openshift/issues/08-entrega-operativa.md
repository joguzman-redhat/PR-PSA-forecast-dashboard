# 08: Cerrar la entrega operativa

**What to build:** Comprobar en conjunto actualización, persistencia, acceso interno y operación. Entregar guía y pasos humanos pendientes sin dar por completa una capacidad no verificada.

**Blocked by:** 05, 07.

**Status:** needs-info

- [ ] Evidencia real commit→imagen→rollout→dashboard/API con histórico.
- [ ] Aislamiento comprobado y límites de comprobación externa explícitos.
- [ ] Datos y configuración persisten en actualización controlada.
- [ ] Backups y recuperación con evidencia o dependencia pendiente; no cerrar si quedan requisitos obligatorios.
- [ ] Guía de despliegue, migración, reversión, restore y mantenimiento n8n.
- [ ] Responsable operativo identificado; importación/configuración del workflow posterior a cargo del usuario.

## Comments

Spec: [Despliegue oficial](../spec.md).

## Actualización verificada

Despliegue, actualización manual y dos respaldos comprobados, documentación y evidencia actualizadas. No se cierra toda la entrega: Argo/webhook/promoción, aislamiento fino y recuperación integral/retención siguen pendientes. Usuario vigila fallos y configura n8n posteriormente.

Evidencia: [Estado del despliegue](../../../openshift/ESTADO-DESPLIEGUE.md).
