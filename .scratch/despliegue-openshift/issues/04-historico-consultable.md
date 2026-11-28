# 04: Consultar el histórico existente en OpenShift

**What to build:** Transferir el histórico financiero autorizado y mostrarlo en el dashboard conservando Snapshots y reglas vigentes. No reconstruir el pasado desde las Cargas actuales.

**Blocked by:** 03.

**Status:** ready-for-agent

- [ ] Identificar origen, destino y estado real del esquema sin leer infra/.env.
- [ ] Backup antes de cambios y evidencia local previa de migración de identidad según ADR 0003.
- [ ] Evitar reaplicar migraciones ya incluidas en la fuente.
- [ ] Comparar conteos, períodos y Booking/Ejecutado/Backlog sin volcar datos sensibles a logs.
- [ ] Verificar histórico mediante dashboard/API y documentar recuperación ante fallos.

## Comments

Spec: [Despliegue oficial](../spec.md).
