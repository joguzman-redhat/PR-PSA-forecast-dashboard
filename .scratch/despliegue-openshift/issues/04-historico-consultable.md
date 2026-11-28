# 04: Consultar el histórico existente en OpenShift

**What to build:** Transferir el histórico financiero autorizado y mostrarlo en el dashboard conservando Snapshots y reglas vigentes. No reconstruir el pasado desde las Cargas actuales.

**Blocked by:** 03.

**Status:** resolved

- [x] Identificar origen, destino y estado real del esquema sin leer infra/.env.
- [x] Backup antes de cambios y evidencia local previa de migración de identidad según ADR 0003.
- [x] Evitar reaplicar migraciones ya incluidas en la fuente.
- [x] Comparar conteos, períodos y Booking/Ejecutado/Backlog sin volcar datos sensibles a logs.
- [x] Verificar histórico mediante dashboard/API y documentar recuperación ante fallos.

## Comments

Spec: [Despliegue oficial](../spec.md).

## Answer

Fuente local preservada. Dump previo privado, restauración transaccional en destino vacío, baseline adoptado explícitamente, hashes/conteos de siete tablas idénticos. Histórico visible y conciliación financiera aprobada antes y después del nuevo rollout.

Evidencia: [Estado del despliegue](../../../openshift/ESTADO-DESPLIEGUE.md).
