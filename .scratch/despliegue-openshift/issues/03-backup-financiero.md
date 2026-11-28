# 03: Respaldar y recuperar la base financiera

**What to build:** Respaldar Postgres en un destino corporativo recuperable y documentar restauración segura antes de trasladar el histórico. Un PVC por sí solo no acredita backup.

**Blocked by:** 02.

**Status:** ready-for-agent

- [ ] Definir destino, retención, cifrado, permisos y frecuencia conforme RPO 24 horas.
- [ ] Documentar restauración conforme objetivo RTO 4 horas en horario laboral.
- [ ] Verificar recuperación de forma segura; no sobrescribir la base oficial ni crear recursos temporales no acordados.
- [ ] Si falta destino o permiso, registrar dependencia y no afirmar cumplimiento.
- [ ] Resultados y fallos consultables sin correos.

## Comments

Spec: [Despliegue oficial](../spec.md).
